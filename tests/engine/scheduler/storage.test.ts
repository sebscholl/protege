import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import {
  claimNextQueuedRun,
  disableResponsibility,
  enqueueResponsibilityRun,
  enqueueResponsibilityRunIfIdle,
  hasQueuedRunForPersona,
  listEnabledResponsibilitiesByPersona,
  listResponsibilitiesByPersona,
  listResponsibilityRunsByPersona,
  markRunFailed,
  recordSkippedRun,
  markRunSucceeded,
  upsertResponsibility,
} from '@engine/scheduler/storage';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let allResponsibilityCount = 0;
let enabledResponsibilityCount = 0;
let claimedRunStatus = '';
let succeededRunStatus = '';
let failedRunStatus = '';
let overlapFirstEnqueued = false;
let overlapSecondEnqueued = true;
let personaHasQueuedAfterOverlap = false;
let overlapClaimBlockedByRunning = false;
let failedRunCategory = '';
let skippedOverlapRunStatus = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-scheduler-storage-'));
  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });
  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-1',
      personaId: 'persona-a',
      name: 'Morning Brief',
      schedule: '0 9 * * *',
      promptPath: '/tmp/persona-a/responsibilities/resp-1.md',
      promptHash: 'hash-1',
      enabled: true,
    },
    nowIso: '2026-02-20T10:00:00.000Z',
  });
  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-2',
      personaId: 'persona-a',
      name: 'Evening Brief',
      schedule: '0 17 * * *',
      promptPath: '/tmp/persona-a/responsibilities/resp-2.md',
      promptHash: 'hash-2',
      enabled: true,
    },
    nowIso: '2026-02-20T10:00:00.000Z',
  });
  disableResponsibility({
    db: db as ProtegeDatabase,
    responsibilityId: 'resp-2',
    nowIso: '2026-02-20T10:05:00.000Z',
  });
  allResponsibilityCount = listResponsibilitiesByPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  }).length;
  enabledResponsibilityCount = listEnabledResponsibilitiesByPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  }).length;

  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-1',
      personaId: 'persona-a',
      triggeredAt: '2026-02-20T11:00:00.000Z',
      promptPathAtRun: '/tmp/persona-a/responsibilities/resp-1.md',
      promptHashAtRun: 'hash-1',
      promptSnapshot: 'Prompt snapshot text',
    },
    runId: 'run-1',
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-1',
      personaId: 'persona-a',
      triggeredAt: '2026-02-20T12:00:00.000Z',
      promptPathAtRun: '/tmp/persona-a/responsibilities/resp-1.md',
      promptHashAtRun: 'hash-1',
      promptSnapshot: 'Prompt snapshot text 2',
    },
    runId: 'run-2',
  });
  const claimed = claimNextQueuedRun({
    db: db as ProtegeDatabase,
    startedAt: '2026-02-20T11:01:00.000Z',
  });
  claimedRunStatus = claimed?.status ?? '';
  markRunSucceeded({
    db: db as ProtegeDatabase,
    runId: 'run-1',
    finishedAt: '2026-02-20T11:02:00.000Z',
    threadId: 'thread-1',
    inboundMessageId: '<inbound-1@localhost>',
    outboundMessageId: '<outbound-1@localhost>',
  });
  markRunFailed({
    db: db as ProtegeDatabase,
    runId: 'run-2',
    finishedAt: '2026-02-20T12:02:00.000Z',
    errorMessage: 'Provider unavailable',
    failureCategory: 'runtime',
    threadId: 'thread-2',
    inboundMessageId: '<inbound-2@localhost>',
  });
  recordSkippedRun({
    db: db as ProtegeDatabase,
    runId: 'run-skipped-overlap',
    responsibilityId: 'resp-1',
    personaId: 'persona-a',
    status: 'skipped_overlap',
    triggeredAt: '2026-02-20T12:03:00.000Z',
  });
  const runs = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  });
  succeededRunStatus = runs.find((run) => run.id === 'run-1')?.status ?? '';
  failedRunStatus = runs.find((run) => run.id === 'run-2')?.status ?? '';
  failedRunCategory = runs.find((run) => run.id === 'run-2')?.failureCategory ?? '';
  skippedOverlapRunStatus = runs.find((run) => run.id === 'run-skipped-overlap')?.status ?? '';

  const firstOverlapRun = enqueueResponsibilityRunIfIdle({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-1',
      personaId: 'persona-a',
      triggeredAt: '2026-02-20T13:00:00.000Z',
    },
    runId: 'run-overlap-1',
  });
  const secondOverlapRun = enqueueResponsibilityRunIfIdle({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-1',
      personaId: 'persona-a',
      triggeredAt: '2026-02-20T13:00:01.000Z',
    },
    runId: 'run-overlap-2',
  });
  overlapFirstEnqueued = firstOverlapRun.enqueued;
  overlapSecondEnqueued = secondOverlapRun.enqueued;
  personaHasQueuedAfterOverlap = hasQueuedRunForPersona({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
  });

  const overlapRunningClaim = claimNextQueuedRun({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
    startedAt: '2026-02-20T13:00:02.000Z',
  });
  if (!overlapRunningClaim) {
    throw new Error('Expected overlap run claim to produce running row.');
  }
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-1',
      personaId: 'persona-a',
      triggeredAt: '2026-02-20T13:00:03.000Z',
    },
    runId: 'run-overlap-forced',
  });
  const blockedClaim = claimNextQueuedRun({
    db: db as ProtegeDatabase,
    personaId: 'persona-a',
    startedAt: '2026-02-20T13:00:04.000Z',
  });
  overlapClaimBlockedByRunning = blockedClaim === undefined;
});

afterAll((): void => {
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('scheduler storage', () => {
  it('lists responsibilities by persona id', () => {
    expect(allResponsibilityCount).toBe(2);
  });

  it('lists only enabled responsibilities for runtime registration', () => {
    expect(enabledResponsibilityCount).toBe(1);
  });

  it('claims queued runs into running status', () => {
    expect(claimedRunStatus).toBe('running');
  });

  it('stores succeeded run status after completion', () => {
    expect(succeededRunStatus).toBe('succeeded');
  });

  it('stores failed run status after terminal errors', () => {
    expect(failedRunStatus).toBe('failed');
  });

  it('stores failed run category for terminal errors', () => {
    expect(failedRunCategory).toBe('runtime');
  });

  it('stores explicit skipped-overlap run outcomes', () => {
    expect(skippedOverlapRunStatus).toBe('skipped_overlap');
  });

  it('enqueues when no open run exists for one responsibility', () => {
    expect(overlapFirstEnqueued).toBe(true);
  });

  it('skips enqueue when responsibility already has open queued/running run', () => {
    expect(overlapSecondEnqueued).toBe(false);
  });

  it('detects queued runs for one persona', () => {
    expect(personaHasQueuedAfterOverlap).toBe(true);
  });

  it('does not claim queued runs for a responsibility that already has a running row', () => {
    expect(overlapClaimBlockedByRunning).toBe(true);
  });
});
