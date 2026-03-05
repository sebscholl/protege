import type { SchedulerCronTask } from '@engine/scheduler/cron';
import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createSchedulerPersonaState, runSchedulerCycle } from '@engine/scheduler/runtime';
import { startPersonaSchedulerCron } from '@engine/scheduler/cron';
import { createPersona } from '@engine/shared/personas';
import {
  claimNextQueuedRun,
  enqueueResponsibilityRun,
  enqueueResponsibilityRunIfIdle,
  listResponsibilityRunsByPersona,
  markRunSucceeded,
} from '@engine/scheduler/storage';
import { toJsonRecord } from '@tests/helpers/json';
import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { loadNetworkFixture } from '@tests/network/index';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let personaId = '';
let schedulerRunSucceeded = false;
let schedulerRunSkippedOverlapPersisted = false;
let schedulerRunDuplicateSuccessAbsent = false;
let schedulerFailurePersistedWithRuntimeCategory = false;
let schedulerAlertOutboundObserved = false;
let schedulerRelayFrameTypes: string[] = [];
let schedulerConcurrentResponsibilitiesObserved = false;
let schedulerLongRunningOverlapSkipObserved = false;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let providerScaffold!: ReturnType<typeof scaffoldProviderConfig>;

/**
 * Creates one deterministic fake scheduler task handle for cron callbacks in e2e setup.
 */
function createFakeSchedulerTask(): SchedulerCronTask {
  return {
    stop: (): void => undefined,
  };
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-scheduler-reliability-',
    symlinkExtensionsFromRepo: true,
  });
  tempRootPath = workspace.tempRootPath;
  providerScaffold = scaffoldProviderConfig({
    workspace,
    providerName: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKeyValue: 'test-key',
    patchExtensionsManifest: false,
    writeProviderConfig: false,
  });

  const persona = createPersona({});
  personaId = persona.personaId;
  const responsibilitiesDirPath = join(tempRootPath, 'personas', personaId, 'responsibilities');
  mkdirSync(responsibilitiesDirPath, { recursive: true });
  writeFileSync(join(responsibilitiesDirPath, 'scheduler-e2e.md'), [
    '---',
    'name: Scheduler E2E Task',
    'schedule: * * * * *',
    'enabled: true',
    '---',
    'Use send_email to report scheduler success.',
  ].join('\n'));
  writeFileSync(join(responsibilitiesDirPath, 'scheduler-concurrent-a.md'), [
    '---',
    'name: Scheduler Concurrent A',
    'schedule: * * * * *',
    'enabled: true',
    '---',
    'Concurrent task A.',
  ].join('\n'));
  writeFileSync(join(responsibilitiesDirPath, 'scheduler-concurrent-b.md'), [
    '---',
    'name: Scheduler Concurrent B',
    'schedule: * * * * *',
    'enabled: true',
    '---',
    'Concurrent task B.',
  ].join('\n'));
  writeFileSync(join(responsibilitiesDirPath, 'scheduler-long-running.md'), [
    '---',
    'name: Scheduler Long Running',
    'schedule: * * * * *',
    'enabled: true',
    '---',
    'Long running task.',
  ].join('\n'));

  workspace.patchConfigFiles({
    'context.json': {
      thread: ['thread-history', 'current-input'],
      responsibility: ['current-input'],
    },
    'system.json': {
      logs_dir_path: join(tempRootPath, 'tmp', 'logs'),
      console_log_format: 'json',
    },
  });

  const firstResponseFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200-tool-call',
  }).response.body;
  const secondResponseFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200',
  }).response.body;
  let providerCallCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      const payload = providerCallCount % 2 === 0 ? firstResponseFixture : secondResponseFixture;
      providerCallCount += 1;
      return HttpResponse.json(toJsonRecord({
        value: payload,
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));

  const relayFrames: Buffer[] = [];
  const relayClientsByPersonaId = new Map([
    [
      personaId,
      {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (
          args: {
            frame: Buffer;
          },
        ): void => {
          relayFrames.push(args.frame);
        },
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: true,
          authenticated: true,
          reconnectAttempt: 0,
        }),
      },
    ],
  ]);

  const logger = {
    info: (): void => undefined,
    error: (): void => undefined,
  };

  const personaState = createSchedulerPersonaState({
    personaId,
    logger,
  });
  personaState.cronController.stop();

  const cronCallbacks: Array<() => void> = [];
  const cronController = startPersonaSchedulerCron({
    db: personaState.db,
    personaId,
    logger,
    scheduleFn: (
      scheduleArgs: {
        expression: string;
        onTick: () => void;
      },
    ): SchedulerCronTask => {
      cronCallbacks.push(scheduleArgs.onTick);
      return createFakeSchedulerTask();
    },
    validateFn: (): boolean => true,
    now: (): string => '2026-02-27T10:00:00.000Z',
  });
  cronCallbacks[0]?.();
  cronCallbacks[0]?.();
  cronController.stop();

  enqueueResponsibilityRun({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-e2e',
      personaId,
      triggeredAt: '2026-02-27T10:00:05.000Z',
    },
    runId: 'run-scheduler-e2e-success',
  });

  await runSchedulerCycle({
    personaStates: [personaState],
    logger,
    relayClientsByPersonaId,
    maxGlobalConcurrentRuns: 5,
    adminContactEmail: undefined,
  });

  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      return HttpResponse.json(toJsonRecord({
        value: loadNetworkFixture({
          fixtureKey: 'openai/chat-completions/500',
        }).response.body,
      }), {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));

  enqueueResponsibilityRun({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-e2e',
      personaId,
      triggeredAt: '2026-02-27T10:05:00.000Z',
    },
    runId: 'run-runtime-failure',
  });
  await runSchedulerCycle({
    personaStates: [personaState],
    logger,
    relayClientsByPersonaId,
    maxGlobalConcurrentRuns: 5,
    adminContactEmail: 'admin@example.com',
  });

  const runs = listResponsibilityRunsByPersona({
    db: personaState.db,
    personaId,
  });
  const succeededE2eRun = runs.find((run) => run.id === 'run-scheduler-e2e-success');
  const skippedOverlapRuns = runs.filter((run) => run.status === 'skipped_overlap');
  const overlapTickSucceededRuns = runs.filter((run) => {
    return run.status === 'succeeded'
      && run.triggeredAt === '2026-02-27T10:00:00.000Z';
  });
  const runtimeFailureRun = runs.find((run) => run.id === 'run-runtime-failure');
  schedulerRunSucceeded = succeededE2eRun?.status === 'succeeded';
  schedulerRunSkippedOverlapPersisted = skippedOverlapRuns.length >= 1;
  schedulerRunDuplicateSuccessAbsent = overlapTickSucceededRuns.length === 1;
  schedulerFailurePersistedWithRuntimeCategory = runtimeFailureRun?.status === 'failed'
    && runtimeFailureRun.failureCategory === 'runtime';

  schedulerRelayFrameTypes = relayFrames.map((frame): string => {
    return parseRelayTunnelFrame({
      payload: frame,
    })?.type ?? 'unknown';
  });
  schedulerAlertOutboundObserved = relayFrames.some((frame): boolean => {
    const parsed = parseRelayTunnelFrame({
      payload: frame,
    });
    return parsed?.type === 'smtp_chunk'
      && parsed.chunk.toString('utf8').includes('Scheduler failure:');
  });

  enqueueResponsibilityRun({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-concurrent-a',
      personaId,
      triggeredAt: '2026-02-27T10:06:00.000Z',
    },
    runId: 'run-concurrent-a',
  });
  enqueueResponsibilityRun({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-concurrent-b',
      personaId,
      triggeredAt: '2026-02-27T10:06:00.500Z',
    },
    runId: 'run-concurrent-b',
  });

  let concurrentInFlightCount = 0;
  let maxConcurrentInFlightCount = 0;
  const concurrentResponsibilityIds = new Set<string>();
  await runSchedulerCycle({
    personaStates: [personaState],
    logger,
    relayClientsByPersonaId,
    maxGlobalConcurrentRuns: 2,
    adminContactEmail: undefined,
    runNextQueuedResponsibilityFn: async (
      runArgs,
    ) => {
      const claimedRun = claimNextQueuedRun({
        db: runArgs.db as ProtegeDatabase,
        personaId: runArgs.personaId,
        startedAt: new Date().toISOString(),
      });
      if (!claimedRun) {
        return {
          status: 'idle',
        };
      }

      concurrentResponsibilityIds.add(claimedRun.responsibilityId);
      concurrentInFlightCount += 1;
      maxConcurrentInFlightCount = Math.max(maxConcurrentInFlightCount, concurrentInFlightCount);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      markRunSucceeded({
        db: runArgs.db as ProtegeDatabase,
        runId: claimedRun.id,
        finishedAt: new Date().toISOString(),
        threadId: `thread.${claimedRun.id}`,
        inboundMessageId: `<inbound.${claimedRun.id}@localhost>`,
        outboundMessageId: `<outbound.${claimedRun.id}@localhost>`,
      });
      concurrentInFlightCount -= 1;
      return {
        status: 'succeeded',
        runId: claimedRun.id,
      };
    },
  });
  schedulerConcurrentResponsibilitiesObserved = maxConcurrentInFlightCount === 2
    && concurrentResponsibilityIds.has('scheduler-concurrent-a')
    && concurrentResponsibilityIds.has('scheduler-concurrent-b');

  enqueueResponsibilityRun({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-long-running',
      personaId,
      triggeredAt: '2026-02-27T10:07:00.000Z',
    },
    runId: 'run-long-running-a',
  });
  const longRunningClaimed = claimNextQueuedRun({
    db: personaState.db,
    personaId,
    startedAt: '2026-02-27T10:07:00.010Z',
  });
  if (!longRunningClaimed) {
    throw new Error('Expected long-running run to claim successfully.');
  }
  const longRunningCompletionPromise = (async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 40);
    });
    markRunSucceeded({
      db: personaState.db,
      runId: longRunningClaimed.id,
      finishedAt: '2026-02-27T10:07:00.060Z',
      threadId: 'thread.long-running',
      inboundMessageId: '<inbound.long-running@localhost>',
      outboundMessageId: '<outbound.long-running@localhost>',
    });
  })();
  const longRunningOverlapAttempt = enqueueResponsibilityRunIfIdle({
    db: personaState.db,
    run: {
      responsibilityId: 'scheduler-long-running',
      personaId,
      triggeredAt: '2026-02-27T10:07:00.020Z',
    },
    runId: 'run-long-running-b',
  });
  schedulerLongRunningOverlapSkipObserved = longRunningOverlapAttempt.enqueued === false
    && longRunningOverlapAttempt.skipReason === 'overlap';
  await longRunningCompletionPromise;

  personaState.db.close();
});

afterAll((): void => {
  providerScaffold.restoreEnv();
  workspace.cleanup();
});

describe('scheduler reliability e2e', () => {
  it('executes one queued scheduler run successfully', () => {
    expect(schedulerRunSucceeded).toBe(true);
  });

  it('persists skipped-overlap outcomes for duplicate cron ticks', () => {
    expect(schedulerRunSkippedOverlapPersisted).toBe(true);
  });

  it('does not execute duplicate scheduler successes for one overlap-protected tick pair', () => {
    expect(schedulerRunDuplicateSuccessAbsent).toBe(true);
  });

  it('persists terminal runtime failures with failure category details', () => {
    expect(schedulerFailurePersistedWithRuntimeCategory).toBe(true);
  });

  it('emits scheduler-driven relay outbound smtp frames', () => {
    expect([
      schedulerRelayFrameTypes.includes('smtp_start'),
      schedulerRelayFrameTypes.includes('smtp_chunk'),
      schedulerRelayFrameTypes.includes('smtp_end'),
    ]).toEqual([true, true, true]);
  });

  it('sends scheduler failure alerts when admin contact email is configured', () => {
    expect(schedulerAlertOutboundObserved).toBe(true);
  });

  it('runs multiple distinct responsibilities concurrently under global cap', () => {
    expect(schedulerConcurrentResponsibilitiesObserved).toBe(true);
  });

  it('skips enqueue when long-running responsibility already has one active run', () => {
    expect(schedulerLongRunningOverlapSkipObserved).toBe(true);
  });
});
