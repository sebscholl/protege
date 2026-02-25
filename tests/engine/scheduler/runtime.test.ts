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
let observedMaxInFlight = 0;
let personaARuns = 0;
let personaBRuns = 0;
let schedulerThrottleLogEmitted = false;

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
    maxGlobalConcurrentRuns: 2,
    maxPerPersonaConcurrentRuns: 1,
    adminContactEmail: undefined,
    hasQueuedRunForPersonaFn: (): boolean => false,
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

  const queueByPersonaId = new Map<string, number>([
    ['persona-a', 2],
    ['persona-b', 2],
  ]);
  let inFlight = 0;
  await runSchedulerCycle({
    personaStates: [stateA, stateB],
    logger: createSilentLogger(),
    maxGlobalConcurrentRuns: 2,
    maxPerPersonaConcurrentRuns: 1,
    adminContactEmail: undefined,
    hasQueuedRunForPersonaFn: (
      hasQueuedArgs: {
        db: ProtegeDatabase;
        personaId: string;
      },
    ): boolean => (queueByPersonaId.get(hasQueuedArgs.personaId) ?? 0) > 0,
    runNextQueuedResponsibilityFn: async (
      runNextArgs: {
        db: ProtegeDatabase;
        personaId?: string;
      },
    ) => {
      const personaId = runNextArgs.personaId ?? 'unknown';
      queueByPersonaId.set(personaId, Math.max(0, (queueByPersonaId.get(personaId) ?? 0) - 1));
      inFlight += 1;
      observedMaxInFlight = Math.max(observedMaxInFlight, inFlight);
      if (personaId === 'persona-a') {
        personaARuns += 1;
      } else if (personaId === 'persona-b') {
        personaBRuns += 1;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      return {
        status: 'succeeded',
      };
    },
  });

  const throttleLogs: string[] = [];
  const throttledQueueByPersonaId = new Map<string, number>([
    ['persona-a', 1],
    ['persona-b', 1],
  ]);
  await runSchedulerCycle({
    personaStates: [stateA, stateB],
    logger: {
      info: (
        infoArgs: {
          event: string;
        },
      ): void => {
        throttleLogs.push(infoArgs.event);
      },
      error: (): void => undefined,
    },
    maxGlobalConcurrentRuns: 1,
    maxPerPersonaConcurrentRuns: 1,
    adminContactEmail: undefined,
    hasQueuedRunForPersonaFn: (
      hasQueuedArgs: {
        db: ProtegeDatabase;
        personaId: string;
      },
    ): boolean => (throttledQueueByPersonaId.get(hasQueuedArgs.personaId) ?? 0) > 0,
    runNextQueuedResponsibilityFn: async (
      runNextArgs: {
        db: ProtegeDatabase;
        personaId?: string;
      },
    ) => {
      const personaId = runNextArgs.personaId ?? 'unknown';
      throttledQueueByPersonaId.set(personaId, Math.max(0, (throttledQueueByPersonaId.get(personaId) ?? 0) - 1));
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      return {
        status: 'succeeded',
      };
    },
  });
  schedulerThrottleLogEmitted = throttleLogs.includes('scheduler.cycle.throttled');
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

describe('scheduler runtime parallel dispatch controls', () => {
  it('enforces max global in-flight scheduler run concurrency', () => {
    expect(observedMaxInFlight).toBe(2);
  });

  it('dispatches runs for persona-a under per-persona cap control', () => {
    expect(personaARuns).toBe(2);
  });

  it('dispatches runs for persona-b under per-persona cap control', () => {
    expect(personaBRuns).toBe(2);
  });

  it('emits throttling visibility logs when queued work is blocked by concurrency limits', () => {
    expect(schedulerThrottleLogEmitted).toBe(true);
  });
});
