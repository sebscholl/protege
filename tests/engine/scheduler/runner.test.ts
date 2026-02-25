import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import { createPersona } from '@engine/shared/personas';
import { listResponsibilityRunsByPersona, upsertResponsibility, enqueueResponsibilityRun } from '@engine/scheduler/storage';
import { derivePersonaMailboxIdentity, runNextQueuedResponsibility } from '@engine/scheduler/runner';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let roots: PersonaRoots | undefined;
let successRunStatus = '';
let successOutboundMessageId = '';
let failureRunStatus = '';
let failureAlertCount = 0;
let inboundMessageSubject = '';
let derivedRelayPersonaMailboxIdentity = '';
let successRunDefaultFromAddress = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-scheduler-runner-'));
  roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
  mkdirSync(roots.personasDirPath, { recursive: true });
  mkdirSync(roots.memoryDirPath, { recursive: true });
  const persona = createPersona({
    roots,
    setActive: true,
  });
  const responsibilitiesDirPath = join(roots.personasDirPath, persona.personaId, 'responsibilities');
  mkdirSync(responsibilitiesDirPath, { recursive: true });
  const promptPath = join(responsibilitiesDirPath, 'resp-success.md');
  writeFileSync(promptPath, [
    '---',
    'name: Success Task',
    'schedule: */2 * * * *',
    'enabled: true',
    '---',
    'Tell a short joke.',
  ].join('\n'));

  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });
  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-success',
      personaId: persona.personaId,
      name: 'Success Task',
      schedule: '*/2 * * * *',
      promptPath,
      promptHash: 'hash-success',
      enabled: true,
    },
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-success',
      personaId: persona.personaId,
      triggeredAt: '2026-02-20T10:00:00.000Z',
    },
    runId: 'run-success',
  });
  await runNextQueuedResponsibility({
    db: db as ProtegeDatabase,
    defaultFromAddress: 'protege@mail.protege.bot',
    roots,
    executeRun: async (
      executeArgs: {
        message: InboundNormalizedMessage;
        defaultFromAddress: string;
      },
    ) => {
      inboundMessageSubject = executeArgs.message.subject;
      successRunDefaultFromAddress = executeArgs.defaultFromAddress;
      return {
        responseText: 'done',
        responseMessageId: '<outbound-success@localhost>',
        invokedActions: [],
      };
    },
  });
  const successRun = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId: persona.personaId,
  }).find((run) => run.id === 'run-success');
  successRunStatus = successRun?.status ?? '';
  successOutboundMessageId = successRun?.outboundMessageId ?? '';

  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-fail',
      personaId: persona.personaId,
      name: 'Fail Task',
      schedule: '*/3 * * * *',
      promptPath,
      promptHash: 'hash-fail',
      enabled: true,
    },
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-fail',
      personaId: persona.personaId,
      triggeredAt: '2026-02-20T11:00:00.000Z',
    },
    runId: 'run-fail',
  });
  await runNextQueuedResponsibility({
    db: db as ProtegeDatabase,
    roots,
    executeRun: async (): Promise<never> => {
      throw new Error('Provider failed');
    },
    sendFailureAlert: async (): Promise<void> => {
      failureAlertCount += 1;
    },
  });
  const failedRun = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId: persona.personaId,
  }).find((run) => run.id === 'run-fail');
  failureRunStatus = failedRun?.status ?? '';
  derivedRelayPersonaMailboxIdentity = derivePersonaMailboxIdentity({
    personaEmailLocalPart: persona.emailLocalPart,
    defaultFromAddress: 'protege@mail.protege.bot',
  });

});

afterAll((): void => {
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('scheduler runner', () => {
  it('marks successful run rows as succeeded', () => {
    expect(successRunStatus).toBe('succeeded');
  });

  it('stores outbound message id for succeeded runs', () => {
    expect(successOutboundMessageId).toBe('<outbound-success@localhost>');
  });

  it('builds responsibility synthetic inbound messages with responsibility subject', () => {
    expect(inboundMessageSubject).toBe('Responsibility: Success Task');
  });

  it('derives persona mailbox identity using configured sender domain', () => {
    expect(derivedRelayPersonaMailboxIdentity.endsWith('@mail.protege.bot')).toBe(true);
  });

  it('passes relay-domain persona mailbox identity into executeRun default sender', () => {
    expect(successRunDefaultFromAddress.endsWith('@mail.protege.bot')).toBe(true);
  });

  it('marks failed run rows as failed when execution throws', () => {
    expect(failureRunStatus).toBe('failed');
  });

  it('dispatches one failure alert for failed runs', () => {
    expect(failureAlertCount).toBe(1);
  });
});
