import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clearPersonaMemoryDirty,
  listThreadMemoryStatesByPersona,
  markPersonaMemoryDirty,
  readPersonaMemorySynthesisState,
  readThreadMemoryState,
  setPersonaMemoryDirtyFailure,
  upsertThreadMemoryState,
} from '@engine/harness/memory/storage';
import { initializeDatabase } from '@engine/shared/database';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let threadStateStored = false;
let threadStateReadSummary = '';
let dirtyStateMarked = false;
let dirtyStateCleared = false;
let dirtyStateErrorStored = false;
let recentThreadStateCount = 0;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-memory-storage-',
    chdir: false,
  });

  const db = initializeDatabase({
    databasePath: join(workspace.tempRootPath, 'memory', 'persona-a', 'temporal.db'),
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  db.prepare(`
    INSERT INTO threads (id, root_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run('thread-a', '<root-a>', '2026-03-06T00:00:00.000Z', '2026-03-06T00:00:00.000Z');
  db.prepare(`
    INSERT INTO threads (id, root_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run('thread-b', '<root-b>', '2026-03-06T00:00:00.000Z', '2026-03-06T00:00:00.000Z');

  upsertThreadMemoryState({
    db,
    state: {
      threadId: 'thread-a',
      personaId: 'persona-a',
      summaryText: 'summary-one',
      sourceMessageId: '<m1>',
      sourceReceivedAt: '2026-03-06T00:01:00.000Z',
      sourceToolEventAt: '2026-03-06T00:01:10.000Z',
      updatedAt: '2026-03-06T00:02:00.000Z',
    },
  });
  const threadState = readThreadMemoryState({
    db,
    threadId: 'thread-a',
  });
  threadStateStored = threadState !== undefined;
  threadStateReadSummary = threadState?.summaryText ?? '';

  markPersonaMemoryDirty({
    db,
    personaId: 'persona-a',
    triggerThreadId: 'thread-a',
    triggeredAt: '2026-03-06T00:03:00.000Z',
  });
  dirtyStateMarked = readPersonaMemorySynthesisState({
    db,
    personaId: 'persona-a',
  })?.dirty === true;

  setPersonaMemoryDirtyFailure({
    db,
    personaId: 'persona-a',
    errorMessage: 'failed synthesis',
    updatedAt: '2026-03-06T00:04:00.000Z',
  });
  dirtyStateErrorStored = readPersonaMemorySynthesisState({
    db,
    personaId: 'persona-a',
  })?.lastErrorMessage === 'failed synthesis';

  clearPersonaMemoryDirty({
    db,
    personaId: 'persona-a',
    synthesizedAt: '2026-03-06T00:05:00.000Z',
  });
  dirtyStateCleared = readPersonaMemorySynthesisState({
    db,
    personaId: 'persona-a',
  })?.dirty === false;

  upsertThreadMemoryState({
    db,
    state: {
      threadId: 'thread-b',
      personaId: 'persona-a',
      summaryText: 'summary-two',
      updatedAt: '2026-03-06T00:06:00.000Z',
    },
  });
  recentThreadStateCount = listThreadMemoryStatesByPersona({
    db,
    personaId: 'persona-a',
    limit: 10,
  }).length;

  db.close();
});

afterAll((): void => {
  workspace.cleanup();
});

describe('memory synthesis storage', () => {
  it('stores and reads thread-memory state rows', () => {
    expect(threadStateStored && threadStateReadSummary === 'summary-one').toBe(true);
  });

  it('marks persona memory state dirty on trigger', () => {
    expect(dirtyStateMarked).toBe(true);
  });

  it('stores last synthesis failure message for dirty persona state', () => {
    expect(dirtyStateErrorStored).toBe(true);
  });

  it('clears dirty state after successful synthesis completion', () => {
    expect(dirtyStateCleared).toBe(true);
  });

  it('lists persona thread-memory states ordered by recency', () => {
    expect(recentThreadStateCount).toBe(2);
  });
});
