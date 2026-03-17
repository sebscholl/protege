import type { HarnessProviderId, HookEventPayloadByName, HarnessHookResult } from 'protege-toolkit';
import type { PersonaMemorySynthesisState, ThreadMemoryState } from 'protege-toolkit';
import type { ProtegeDatabase } from 'protege-toolkit';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { initializeDatabase } from 'protege-toolkit';
import { resolvePersonaMemoryPaths } from 'protege-toolkit';
import { HOOK_EVENT } from 'protege-toolkit';
import {
  clearPersonaMemoryDirty,
  listThreadMemoryStatesByPersona,
  markPersonaMemoryDirty,
  readPersonaMemorySynthesisState,
  setPersonaMemoryDirtyFailure,
} from 'protege-toolkit';
import { synthesizeMemoryText } from 'protege-toolkit';
import { resolveMigrationsDirPath } from 'protege-toolkit';

/**
 * Represents one resolved active-memory updater config payload.
 */
export type ActiveMemoryUpdaterConfig = {
  provider?: HarnessProviderId;
  model?: string;
  promptPath: string;
  maxOutputTokens?: number;
  maxRecentThreads: number;
  debounceMs: number;
};

/**
 * Represents one dependency bundle used by active-memory updater hook.
 */
export type ActiveMemoryUpdaterDependencies = {
  openPersonaDatabase: (personaId: string) => ProtegeDatabase;
  markDirty: (db: ProtegeDatabase, personaId: string, threadId: string) => void;
  readState: (db: ProtegeDatabase, personaId: string) => PersonaMemorySynthesisState | undefined;
  listThreadStates: (db: ProtegeDatabase, personaId: string, limit: number) => ThreadMemoryState[];
  readActiveMemory: (activeMemoryPath: string) => string;
  writeActiveMemory: (activeMemoryPath: string, text: string) => void;
  clearDirty: (db: ProtegeDatabase, personaId: string) => void;
  markFailure: (db: ProtegeDatabase, personaId: string, message: string) => void;
  synthesize: (args: {
    provider?: HarnessProviderId;
    model?: string;
    promptPath: string;
    maxOutputTokens?: number;
    inputText: string;
  }) => Promise<{
    provider: HarnessProviderId;
    model: string;
    outputText: string;
  }>;
  nowIso: () => string;
};

/**
 * Creates one active-memory updater hook callback with injectable dependencies.
 */
export function createActiveMemoryUpdaterHook(
  deps: ActiveMemoryUpdaterDependencies = createDefaultActiveMemoryUpdaterDependencies(),
): (
  event: string,
  payload: HookEventPayloadByName[typeof HOOK_EVENT.MemoryThreadUpdated],
  config: Record<string, unknown>,
) => Promise<HarnessHookResult> {
  return async (
    event,
    payload,
    config,
  ): Promise<HarnessHookResult> => {
    if (event !== HOOK_EVENT.MemoryThreadUpdated) {
      return undefined;
    }

    const personaId = typeof payload.personaId === 'string'
      ? payload.personaId
      : '';
    if (personaId.length === 0) {
      return undefined;
    }

    const threadId = typeof payload.threadId === 'string'
      ? payload.threadId
      : 'unknown';
    const resolvedConfig = resolveActiveMemoryUpdaterConfig({ config });
    const personaPaths = resolvePersonaMemoryPaths({ personaId });
    const db = deps.openPersonaDatabase(personaId);
    try {
      deps.markDirty(db, personaId, threadId);
      const state = deps.readState(db, personaId);
      if (!state?.dirty) {
        return undefined;
      }
      if (!isDebounceElapsed({
        state,
        debounceMs: resolvedConfig.debounceMs,
      })) {
        return undefined;
      }

      const activeMemoryText = deps.readActiveMemory(personaPaths.activeMemoryPath);
      const threadStates = deps.listThreadStates(db, personaId, resolvedConfig.maxRecentThreads);
      const synthesisInputText = buildActiveMemorySynthesisInput({
        activeMemoryText,
        threadStates,
      });
      const synthesis = await deps.synthesize({
        provider: resolvedConfig.provider,
        model: resolvedConfig.model,
        promptPath: resolvedConfig.promptPath,
        maxOutputTokens: resolvedConfig.maxOutputTokens,
        inputText: synthesisInputText,
      });
      deps.writeActiveMemory(personaPaths.activeMemoryPath, synthesis.outputText);
      deps.clearDirty(db, personaId);

      return {
        emit: [
          {
            event: HOOK_EVENT.MemoryActiveUpdated,
            payload: {
              level: 'info',
              scope: 'memory',
              event: HOOK_EVENT.MemoryActiveUpdated,
              timestamp: deps.nowIso(),
              personaId,
              threadId,
              synthesisProvider: synthesis.provider,
              synthesisModel: synthesis.model,
            },
          },
        ],
      };
    } catch (error) {
      deps.markFailure(
        db,
        personaId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      db.close();
    }
  };
}

/**
 * Runs active-memory synthesis on `memory.thread.updated` emissions.
 */
export const onEvent = createActiveMemoryUpdaterHook();

/**
 * Creates default dependency wiring for active-memory updater runtime behavior.
 */
export function createDefaultActiveMemoryUpdaterDependencies(): ActiveMemoryUpdaterDependencies {
  return {
    openPersonaDatabase: (
      personaId,
    ): ProtegeDatabase => {
      const personaPaths = resolvePersonaMemoryPaths({ personaId });
      return initializeDatabase({
        databasePath: personaPaths.temporalDbPath,
        migrationsDirPath: resolveMigrationsDirPath(),
      });
    },
    markDirty: (
      db,
      personaId,
      threadId,
    ): void => {
      markPersonaMemoryDirty({
        db,
        personaId,
        triggerThreadId: threadId,
      });
    },
    readState: (
      db,
      personaId,
    ): PersonaMemorySynthesisState | undefined => readPersonaMemorySynthesisState({
      db,
      personaId,
    }),
    listThreadStates: (
      db,
      personaId,
      limit,
    ): ThreadMemoryState[] => listThreadMemoryStatesByPersona({
      db,
      personaId,
      limit,
    }),
    readActiveMemory: (activeMemoryPath): string => readActiveMemoryFile({ activeMemoryPath }),
    writeActiveMemory: (
      activeMemoryPath,
      text,
    ): void => {
      writeFileSync(activeMemoryPath, `${text.trim()}\n`, 'utf8');
    },
    clearDirty: (
      db,
      personaId,
    ): void => {
      clearPersonaMemoryDirty({
        db,
        personaId,
      });
    },
    markFailure: (
      db,
      personaId,
      message,
    ): void => {
      setPersonaMemoryDirtyFailure({
        db,
        personaId,
        errorMessage: message,
      });
    },
    synthesize: (args) => synthesizeMemoryText(args),
    nowIso: (): string => new Date().toISOString(),
  };
}

/**
 * Resolves active-memory updater config with defaults.
 */
export function resolveActiveMemoryUpdaterConfig(
  args: {
    config: Record<string, unknown>;
  },
): ActiveMemoryUpdaterConfig {
  return {
    provider: readProviderValue({ value: args.config.provider }),
    model: readOptionalString({ value: args.config.model }),
    promptPath: readOptionalString({ value: args.config.prompt_path }) ?? 'prompts/active-summary.md',
    maxOutputTokens: readOptionalNumber({ value: args.config.max_output_tokens }),
    maxRecentThreads: readPositiveInteger({
      value: args.config.max_recent_threads,
      fallback: 6,
    }),
    debounceMs: readNonNegativeInteger({
      value: args.config.debounce_ms,
      fallback: 0,
    }),
  };
}

/**
 * Returns true when synthesis debounce has elapsed for one dirty persona state.
 */
export function isDebounceElapsed(
  args: {
    state: {
      lastSynthesizedAt?: string;
    };
    debounceMs: number;
    nowMs?: number;
  },
): boolean {
  if (args.debounceMs <= 0) {
    return true;
  }
  if (!args.state.lastSynthesizedAt) {
    return true;
  }

  const lastSynthesizedMs = Date.parse(args.state.lastSynthesizedAt);
  if (Number.isNaN(lastSynthesizedMs)) {
    return true;
  }

  const nowMs = args.nowMs ?? Date.now();
  return nowMs - lastSynthesizedMs >= args.debounceMs;
}

/**
 * Reads active-memory markdown content and returns empty string when absent.
 */
export function readActiveMemoryFile(
  args: {
    activeMemoryPath: string;
  },
): string {
  if (!existsSync(args.activeMemoryPath)) {
    return '';
  }

  return readFileSync(args.activeMemoryPath, 'utf8').trim();
}

/**
 * Builds synthesis input text for persona active-memory updates.
 */
export function buildActiveMemorySynthesisInput(
  args: {
    activeMemoryText: string;
    threadStates: ThreadMemoryState[];
  },
): string {
  const priorActiveMemory = args.activeMemoryText.length > 0
    ? args.activeMemoryText
    : '(none)';
  const threadStateText = args.threadStates.length === 0
    ? '(none)'
    : args.threadStates.map((state, index) => (
      `${index + 1}. thread=${state.threadId} updated_at=${state.updatedAt}\n${state.summaryText}`
    )).join('\n\n');

  return [
    'Current Active Memory:',
    priorActiveMemory,
    '',
    'Recent Thread Memory States:',
    threadStateText,
  ].join('\n');
}

/**
 * Reads one optional string from unknown value.
 */
export function readOptionalString(
  args: {
    value: unknown;
  },
): string | undefined {
  return typeof args.value === 'string' && args.value.trim().length > 0
    ? args.value.trim()
    : undefined;
}

/**
 * Reads one optional positive number from unknown value.
 */
export function readOptionalNumber(
  args: {
    value: unknown;
  },
): number | undefined {
  return typeof args.value === 'number' && Number.isFinite(args.value) && args.value > 0
    ? args.value
    : undefined;
}

/**
 * Reads one optional provider id from unknown value.
 */
export function readProviderValue(
  args: {
    value: unknown;
  },
): ActiveMemoryUpdaterConfig['provider'] {
  return args.value === 'openai'
    || args.value === 'anthropic'
    || args.value === 'gemini'
    || args.value === 'grok'
    || args.value === 'openrouter'
    ? args.value
    : undefined;
}

/**
 * Reads one positive integer or fallback when invalid.
 */
export function readPositiveInteger(
  args: {
    value: unknown;
    fallback: number;
  },
): number {
  return typeof args.value === 'number' && Number.isInteger(args.value) && args.value > 0
    ? args.value
    : args.fallback;
}

/**
 * Reads one non-negative integer or fallback when invalid.
 */
export function readNonNegativeInteger(
  args: {
    value: unknown;
    fallback: number;
  },
): number {
  return typeof args.value === 'number' && Number.isInteger(args.value) && args.value >= 0
    ? args.value
    : args.fallback;
}
