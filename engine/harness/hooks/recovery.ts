import type { HookDispatcher } from '@engine/harness/hooks/registry';
import type { HookEventPayloadByName } from '@engine/harness/hooks/events';
import type { ProtegeDatabase } from '@engine/shared/database';

import { HOOK_EVENT } from '@engine/harness/hooks/events';
import { readPersonaMemorySynthesisState } from '@engine/harness/memory/storage';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { initializeDatabase } from '@engine/shared/database';
import { listPersonas, resolvePersonaMemoryPaths } from '@engine/shared/personas';

/**
 * Represents one startup recovery sweep result for dirty memory synthesis states.
 */
export type DirtyMemoryRecoveryResult = {
  scannedPersonaCount: number;
  dirtyPersonaCount: number;
  dispatchedCount: number;
};

/**
 * Represents one optional logger contract used by dirty-memory startup recovery.
 */
export type DirtyMemoryRecoveryLogger = {
  info: (
    args: {
      event: string;
      context: Record<string, unknown>;
    },
  ) => void;
  error: (
    args: {
      event: string;
      context: Record<string, unknown>;
    },
  ) => void;
};

/**
 * Dispatches synthetic `memory.thread.updated` events for personas left dirty across restarts.
 */
export function recoverDirtyMemorySynthesisStates(
  args: {
    hookDispatcher: HookDispatcher;
    logger?: DirtyMemoryRecoveryLogger;
  },
): DirtyMemoryRecoveryResult {
  const personas = listPersonas();
  let dirtyPersonaCount = 0;
  let dispatchedCount = 0;

  for (const persona of personas) {
    let db: ProtegeDatabase | undefined;
    try {
      const personaMemoryPaths = resolvePersonaMemoryPaths({
        personaId: persona.personaId,
      });
      db = initializeDatabase({
        databasePath: personaMemoryPaths.temporalDbPath,
        migrationsDirPath: resolveMigrationsDirPath(),
      });
      const state = readPersonaMemorySynthesisState({
        db,
        personaId: persona.personaId,
      });
      if (!state?.dirty) {
        continue;
      }

      dirtyPersonaCount += 1;
      const threadId = state.lastTriggerThreadId ?? 'recovery';
      const payload: HookEventPayloadByName[typeof HOOK_EVENT.MemoryThreadUpdated] = {
        level: 'info',
        scope: 'memory',
        event: HOOK_EVENT.MemoryThreadUpdated,
        timestamp: new Date().toISOString(),
        personaId: persona.personaId,
        threadId,
        sourceMessageId: null,
        sourceReceivedAt: null,
        sourceToolEventAt: null,
        synthesisProvider: 'recovery',
        synthesisModel: 'recovery',
      };
      args.hookDispatcher.dispatch(
        HOOK_EVENT.MemoryThreadUpdated,
        payload,
      );
      dispatchedCount += 1;
    } catch (error) {
      args.logger?.error({
        event: 'memory.recovery.dispatch_failed',
        context: {
          personaId: persona.personaId,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      db?.close();
    }
  }

  args.logger?.info({
    event: 'memory.recovery.completed',
    context: {
      scannedPersonaCount: personas.length,
      dirtyPersonaCount,
      dispatchedCount,
    },
  });

  return {
    scannedPersonaCount: personas.length,
    dirtyPersonaCount,
    dispatchedCount,
  };
}
