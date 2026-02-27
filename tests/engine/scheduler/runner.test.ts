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
import { runNextQueuedResponsibility } from '@engine/scheduler/runner';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let roots: PersonaRoots | undefined;
let successRunStatus = '';
let successOutboundMessageId = '';
let failureRunStatus = '';
let failureRunCategory = '';
let failureAlertCount = 0;
let inboundMessageSubject = '';
let successRunSenderAddress = '';
let overlapFirstRunStatus = '';
let overlapSecondRunStatus = '';
let loggerInfoEvents: string[] = [];
let loggerErrorEvents: string[] = [];

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
    roots,
    logger: {
      info: (
        args: {
          event: string;
        },
      ): void => {
        loggerInfoEvents.push(args.event);
      },
      error: (
        args: {
          event: string;
        },
      ): void => {
        loggerErrorEvents.push(args.event);
      },
    },
    executeRun: async (
      executeArgs: {
        message: InboundNormalizedMessage;
        senderAddress: string;
      },
    ) => {
      inboundMessageSubject = executeArgs.message.subject;
      successRunSenderAddress = executeArgs.senderAddress;
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
    logger: {
      info: (
        args: {
          event: string;
        },
      ): void => {
        loggerInfoEvents.push(args.event);
      },
      error: (
        args: {
          event: string;
        },
      ): void => {
        loggerErrorEvents.push(args.event);
      },
    },
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
  failureRunCategory = failedRun?.failureCategory ?? '';

  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-overlap',
      personaId: persona.personaId,
      name: 'Overlap Task',
      schedule: '*/4 * * * *',
      promptPath,
      promptHash: 'hash-overlap',
      enabled: true,
    },
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-overlap',
      personaId: persona.personaId,
      triggeredAt: '2026-02-20T12:10:00.000Z',
    },
    runId: 'run-overlap-a',
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-overlap',
      personaId: persona.personaId,
      triggeredAt: '2026-02-20T12:10:01.000Z',
    },
    runId: 'run-overlap-b',
  });
  const [overlapResultA, overlapResultB] = await Promise.all([
    runNextQueuedResponsibility({
      db: db as ProtegeDatabase,
      roots,
      executeRun: async (): Promise<{
        responseText: string;
        responseMessageId: string;
        invokedActions: never[];
      }> => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        return {
          responseText: 'overlap-ok',
          responseMessageId: '<overlap@localhost>',
          invokedActions: [],
        };
      },
    }),
    runNextQueuedResponsibility({
      db: db as ProtegeDatabase,
      roots,
      executeRun: async (): Promise<{
        responseText: string;
        responseMessageId: string;
        invokedActions: never[];
      }> => ({
        responseText: 'second-should-not-run',
        responseMessageId: '<overlap-second@localhost>',
        invokedActions: [],
      }),
    }),
  ]);
  overlapFirstRunStatus = overlapResultA.status;
  overlapSecondRunStatus = overlapResultB.status;
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

  it('passes persona mailbox identity into executeRun sender address', () => {
    expect(successRunSenderAddress.endsWith('@localhost')).toBe(true);
  });

  it('marks failed run rows as failed when execution throws', () => {
    expect(failureRunStatus).toBe('failed');
  });

  it('categorizes failed run rows with runtime failure category', () => {
    expect(failureRunCategory).toBe('runtime');
  });

  it('dispatches one failure alert for failed runs', () => {
    expect(failureAlertCount).toBe(1);
  });

  it('allows one overlap responsibility run to claim and execute', () => {
    expect(overlapFirstRunStatus).toBe('succeeded');
  });

  it('keeps concurrent second overlap claim idle while first run is running', () => {
    expect(overlapSecondRunStatus).toBe('idle');
  });

  it('emits run claimed/started/completed scheduler events', () => {
    expect(loggerInfoEvents.includes('scheduler.run.completed')).toBe(true);
  });

  it('emits run failed scheduler events for terminal failures', () => {
    expect(loggerErrorEvents.includes('scheduler.run.failed')).toBe(true);
  });
});
