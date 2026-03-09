import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { HOOK_EVENT } from '@engine/harness/hooks/events';
import { recoverDirtyMemorySynthesisStates } from '@engine/harness/hooks/recovery';
import { markPersonaMemoryDirty } from '@engine/harness/memory/storage';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { initializeDatabase } from '@engine/shared/database';
import { createPersona, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let dispatchCount = 0;
let dispatchedThreadId = '';
let dispatchedPersonaId = '';
let scannedPersonaCount = 0;
let dirtyPersonaCount = 0;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-hooks-recovery-',
  });

  const dirtyPersona = createPersona();
  const cleanPersona = createPersona();

  const dirtyDb = initializeDatabase({
    databasePath: resolvePersonaMemoryPaths({
      personaId: dirtyPersona.personaId,
    }).temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  markPersonaMemoryDirty({
    db: dirtyDb,
    personaId: dirtyPersona.personaId,
    triggerThreadId: 'thread-dirty-1',
  });
  dirtyDb.close();

  const cleanDb = initializeDatabase({
    databasePath: resolvePersonaMemoryPaths({
      personaId: cleanPersona.personaId,
    }).temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  cleanDb.prepare(`
    INSERT INTO persona_memory_synthesis_state (
      persona_id,
      dirty,
      dirty_since,
      last_trigger_thread_id,
      last_triggered_at,
      last_synthesized_at,
      last_error_message,
      updated_at
    ) VALUES (?, 0, NULL, NULL, NULL, ?, NULL, ?)
  `).run(
    cleanPersona.personaId,
    '2026-03-06T10:00:00.000Z',
    '2026-03-06T10:00:00.000Z',
  );
  cleanDb.close();

  const result = recoverDirtyMemorySynthesisStates({
    hookDispatcher: {
      dispatch: (
        event,
        payload,
      ): void => {
        if (event !== HOOK_EVENT.MemoryThreadUpdated) {
          return;
        }
        dispatchCount += 1;
        dispatchedPersonaId = String(payload.personaId ?? '');
        dispatchedThreadId = String(payload.threadId ?? '');
      },
    },
  });

  scannedPersonaCount = result.scannedPersonaCount;
  dirtyPersonaCount = result.dirtyPersonaCount;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('memory recovery startup sweep', () => {
  it('scans persona directories for dirty memory synthesis state', () => {
    expect(scannedPersonaCount > 0).toBe(true);
  });

  it('counts dirty personas and dispatches one recovery event per dirty persona', () => {
    expect(dirtyPersonaCount).toBe(dispatchCount);
  });

  it('dispatches synthetic memory.thread.updated events for active-memory recovery', () => {
    expect(dispatchCount).toBe(1);
  });

  it('preserves the last triggering thread id in recovery payload', () => {
    expect(dispatchedThreadId).toBe('thread-dirty-1');
  });

  it('includes persona identity in recovery payload', () => {
    expect(dispatchedPersonaId.length > 0).toBe(true);
  });
});
