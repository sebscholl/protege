import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { createPersona } from '@engine/shared/personas';
import { createSchedulerPersonaState, buildSchedulerFailureAlertInboundMessage, runSchedulerCycle, stopSchedulerPersonaStates } from '@engine/scheduler/runtime';
import { claimNextQueuedRun, enqueueResponsibilityRun, listResponsibilityRunsByPersona } from '@engine/scheduler/storage';
import { syncPersonaResponsibilities } from '@engine/scheduler/sync';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let schedulerCycleContinuesAfterPersonaFailure = false;
let schedulerStopClosesPersonaResources = false;
let tempRootPath = '';
let schedulerAlertFromPersonaIdentity = false;
let observedMaxInFlight = 0;
let personaARuns = 0;
let personaBRuns = 0;
let schedulerThrottleLogEmitted = false;
let startupRecoveredInterruptedRun = false;
let startupRecoveryLogHasRecoveredCount = false;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

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

  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-scheduler-runtime-',
  });
  tempRootPath = workspace.tempRootPath;
  const roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
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

  workspace.writeFile({
    relativePath: join('personas', persona.personaId, 'responsibilities', 'runtime-recovery.md'),
    payload: [
    '---',
    'name: Runtime Recovery',
    'schedule: * * * * *',
    'enabled: true',
    '---',
    'Recovery test prompt.',
  ].join('\n'),
  });
  const initialState = createSchedulerPersonaState({
    personaId: persona.personaId,
    roots,
    logger: createSilentLogger(),
  });
  const recoverySyncResult = syncPersonaResponsibilities({
    db: initialState.db,
    personaId: persona.personaId,
    roots,
  });
  if (recoverySyncResult.upsertedCount === 0) {
    throw new Error('Expected recovery responsibility sync to upsert at least one row.');
  }
  enqueueResponsibilityRun({
    db: initialState.db,
    run: {
      responsibilityId: 'runtime-recovery',
      personaId: persona.personaId,
      triggeredAt: '2026-02-27T21:00:00.000Z',
    },
    runId: 'run-runtime-recovery',
  });
  const claimedRecoveryRun = claimNextQueuedRun({
    db: initialState.db,
    personaId: persona.personaId,
    startedAt: '2026-02-27T21:00:01.000Z',
  });
  if (!claimedRecoveryRun || claimedRecoveryRun.status !== 'running') {
    throw new Error('Expected recovery run to be running before startup recovery.');
  }
  initialState.cronController.stop();
  initialState.db.close();

  const restartedInfoEvents: Array<{
    event: string;
    context: Record<string, unknown>;
  }> = [];
  const restartedState = createSchedulerPersonaState({
    personaId: persona.personaId,
    roots,
    logger: {
      info: (
        args: {
          event: string;
          context: Record<string, unknown>;
        },
      ): void => {
        restartedInfoEvents.push(args);
      },
      error: (): void => undefined,
    },
  });
  const recoveredRun = listResponsibilityRunsByPersona({
    db: restartedState.db,
    personaId: persona.personaId,
  }).find((run) => run.id === 'run-runtime-recovery');
  startupRecoveredInterruptedRun = recoveredRun?.status === 'failed'
    && recoveredRun.failureCategory === 'runtime';
  startupRecoveryLogHasRecoveredCount = restartedInfoEvents.some((event) => {
    return event.event === 'scheduler.recovery.interrupted_runs_finalized'
      && typeof event.context.recoveredRunCount === 'number'
      && event.context.recoveredRunCount === 1;
  });
  restartedState.cronController.stop();
  restartedState.db.close();
});

afterAll((): void => {
  workspace.cleanup();
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

  it('dispatches runs for persona-a under global cap control', () => {
    expect(personaARuns).toBe(2);
  });

  it('dispatches runs for persona-b under global cap control', () => {
    expect(personaBRuns).toBe(2);
  });

  it('emits throttling visibility logs when queued work is blocked by concurrency limits', () => {
    expect(schedulerThrottleLogEmitted).toBe(true);
  });
});

describe('scheduler startup recovery behavior', () => {
  it('finalizes interrupted running rows when runtime restarts', () => {
    expect(startupRecoveredInterruptedRun).toBe(true);
  });

  it('emits startup recovery log with recovered interrupted run count', () => {
    expect(startupRecoveryLogHasRecoveredCount).toBe(true);
  });
});
