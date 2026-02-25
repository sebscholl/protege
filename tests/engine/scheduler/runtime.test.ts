import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { createPersona } from '@engine/shared/personas';
import { buildSchedulerFailureAlertInboundMessage, runSchedulerCycle, stopSchedulerPersonaStates } from '@engine/scheduler/runtime';

let schedulerCycleContinuesAfterPersonaFailure = false;
let schedulerStopClosesPersonaResources = false;
let tempRootPath = '';
let schedulerAlertFromPersonaIdentity = false;

/**
 * Creates one no-op gateway logger for scheduler runtime tests.
 */
function createSilentLogger(): GatewayLogger {
  return {
    info: (): void => undefined,
    error: (): void => undefined,
  };
}

/**
 * Creates one scheduler persona state with fake close/stop side effects.
 */
function createFakePersonaState(
  args: {
    personaId: string;
    onClose?: () => void;
    onStop?: () => void;
  },
): {
  personaId: string;
  db: ProtegeDatabase;
  cronController: {
    refresh: () => void;
    stop: () => void;
  };
} {
  return {
    personaId: args.personaId,
    db: {
      prepare: (): never => {
        throw new Error('not_implemented');
      },
      close: (): void => {
        args.onClose?.();
      },
    } as unknown as ProtegeDatabase,
    cronController: {
      refresh: (): void => undefined,
      stop: (): void => {
        args.onStop?.();
      },
    },
  };
}

beforeAll(async (): Promise<void> => {
  const stateA = createFakePersonaState({
    personaId: 'persona-a',
  });
  const stateB = createFakePersonaState({
    personaId: 'persona-b',
  });
  await runSchedulerCycle({
    personaStates: [stateA, stateB],
    logger: createSilentLogger(),
  });
  schedulerCycleContinuesAfterPersonaFailure = true;

  let closedCount = 0;
  let stoppedCount = 0;
  stopSchedulerPersonaStates({
    personaStates: [
      createFakePersonaState({
        personaId: 'persona-a',
        onClose: (): void => {
          closedCount += 1;
        },
        onStop: (): void => {
          stoppedCount += 1;
        },
      }),
      createFakePersonaState({
        personaId: 'persona-b',
        onClose: (): void => {
          closedCount += 1;
        },
        onStop: (): void => {
          stoppedCount += 1;
        },
      }),
    ],
  });
  schedulerStopClosesPersonaResources = closedCount === 2 && stoppedCount === 2;

  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-scheduler-runtime-'));
  const roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
  mkdirSync(roots.personasDirPath, { recursive: true });
  mkdirSync(roots.memoryDirPath, { recursive: true });
  const persona = createPersona({
    roots,
    emailDomain: 'mail.protege.bot',
  });
  const alertMessage = buildSchedulerFailureAlertInboundMessage({
    personaId: persona.personaId,
    runId: 'run-1',
    responsibilityId: 'resp-1',
    responsibilityName: 'Joke Task',
    errorMessage: 'Provider failed',
    roots,
  });
  schedulerAlertFromPersonaIdentity = alertMessage.envelopeRcptTo[0]?.address.endsWith('@mail.protege.bot') === true;
});

afterAll((): void => {
  if (tempRootPath.length > 0) {
    rmSync(tempRootPath, { recursive: true, force: true });
  }
});

describe('scheduler runtime cycle', () => {
  it('keeps scheduler cycle running when one persona execution path fails', () => {
    expect(schedulerCycleContinuesAfterPersonaFailure).toBe(true);
  });
});

describe('scheduler runtime stop behavior', () => {
  it('stops cron and closes databases for all persona states', () => {
    expect(schedulerStopClosesPersonaResources).toBe(true);
  });
});

describe('scheduler failure alert identity', () => {
  it('builds failure-alert synthetic inbound messages with persona mailbox identity', () => {
    expect(schedulerAlertFromPersonaIdentity).toBe(true);
  });
});
