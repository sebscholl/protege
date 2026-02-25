import type { ProtegeDatabase } from '@engine/shared/database';
import type { SchedulerCronTask } from '@engine/scheduler/cron';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startPersonaSchedulerCron } from '@engine/scheduler/cron';
import { initializeDatabase } from '@engine/shared/database';
import { listResponsibilityRunsByPersona, upsertResponsibility } from '@engine/scheduler/storage';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let scheduleInvocationCount = 0;
let enqueuedRunCount = 0;
let stoppedTaskCount = 0;
let overlapPrevented = false;

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
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-scheduler-cron-'));
  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
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
  enqueuedRunCount = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  }).length;
  overlapPrevented = enqueuedRunCount === 1;
  controller.stop();
});

afterAll((): void => {
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('scheduler cron trigger', () => {
  it('registers only valid enabled responsibility schedules', () => {
    expect(scheduleInvocationCount).toBe(1);
  });

  it('enqueues one run record when a registered tick fires', () => {
    expect(enqueuedRunCount).toBe(1);
  });

  it('stops registered schedule tasks on controller stop', () => {
    expect(stoppedTaskCount).toBe(1);
  });

  it('prevents overlap by skipping enqueue when prior run remains open', () => {
    expect(overlapPrevented).toBe(true);
  });
});
