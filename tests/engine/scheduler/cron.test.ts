import type { ProtegeDatabase } from '@engine/shared/database';
import type { SchedulerCronTask } from '@engine/scheduler/cron';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startPersonaSchedulerCron } from '@engine/scheduler/cron';
import { initializeDatabase } from '@engine/shared/database';
import { listResponsibilityRunsByPersona, upsertResponsibility } from '@engine/scheduler/storage';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let scheduleInvocationCount = 0;
let enqueuedRunCount = 0;
let stoppedTaskCount = 0;
let overlapPrevented = false;
let skippedOverlapRunCount = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let repoRootPath = '';

/**
 * Creates one deterministic fake scheduler task handle.
 */
function createFakeTask(
  args: {
    onStop: () => void;
  },
): SchedulerCronTask {
  return {
    stop: (): void => {
      args.onStop();
    },
  };
}

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-scheduler-cron-',
  });
  repoRootPath = workspace.previousCwd;
  tempRootPath = workspace.tempRootPath;
  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(repoRootPath, 'engine', 'shared', 'migrations'),
  });
  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-valid',
      personaId: 'persona-a',
      name: 'Valid',
      schedule: '*/2 * * * *',
      promptPath: '/tmp/valid.md',
      promptHash: 'hash-a',
      enabled: true,
    },
  });
  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-invalid',
      personaId: 'persona-a',
      name: 'Invalid',
      schedule: 'invalid cron',
      promptPath: '/tmp/invalid.md',
      promptHash: 'hash-b',
      enabled: true,
    },
  });

  const callbacks: Array<() => void> = [];
  const controller = startPersonaSchedulerCron({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
    scheduleFn: (
      scheduleArgs: {
        expression: string;
        onTick: () => void;
      },
    ): SchedulerCronTask => {
      scheduleInvocationCount += 1;
      callbacks.push(scheduleArgs.onTick);
      return createFakeTask({
        onStop: (): void => {
          stoppedTaskCount += 1;
        },
      });
    },
    validateFn: (
      validateArgs: {
        expression: string;
      },
    ): boolean => validateArgs.expression !== 'invalid cron',
    now: (): string => '2026-02-20T10:00:00.000Z',
  });
  callbacks[0]?.();
  callbacks[0]?.();
  const runs = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  });
  enqueuedRunCount = runs.filter((run) => run.status === 'queued').length;
  skippedOverlapRunCount = runs.filter((run) => run.status === 'skipped_overlap').length;
  overlapPrevented = enqueuedRunCount === 1 && skippedOverlapRunCount === 1;
  controller.stop();
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('scheduler cron trigger', () => {
  it('registers only valid enabled responsibility schedules', () => {
    expect(scheduleInvocationCount).toBe(1);
  });

  it('enqueues one run record when a registered tick fires', () => {
    expect(enqueuedRunCount).toBe(1);
  });

  it('persists one skipped-overlap run outcome when duplicate tick is blocked', () => {
    expect(skippedOverlapRunCount).toBe(1);
  });

  it('stops registered schedule tasks on controller stop', () => {
    expect(stoppedTaskCount).toBe(1);
  });

  it('prevents overlap by skipping enqueue when prior run remains open', () => {
    expect(overlapPrevented).toBe(true);
  });
});
