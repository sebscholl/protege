import type { HookEventPayloadByName, HarnessHookResult } from '@protege-pack/toolkit';
import type { ThreadMemoryState } from '@protege-pack/toolkit';
import type { HarnessStoredMessage, HarnessThreadToolEvent } from '@protege-pack/toolkit';
import type { ProtegeDatabase } from '@protege-pack/toolkit';

import { initializeDatabase } from '@protege-pack/toolkit';
import { resolvePersonaMemoryPaths } from '@protege-pack/toolkit';
import { HOOK_EVENT } from '@protege-pack/toolkit';
import { listThreadMessages, listThreadToolEventsByThread } from '@protege-pack/toolkit';
import {
  readThreadMemoryState,
  upsertThreadMemoryState,
} from '@protege-pack/toolkit';
import { synthesizeMemoryText } from '@protege-pack/toolkit';
import { resolveMigrationsDirPath } from '@protege-pack/toolkit';

/**
 * Represents one resolved thread-memory updater config payload.
 */
export type ThreadMemoryUpdaterConfig = {
  provider?: 'openai' | 'anthropic' | 'gemini' | 'grok';
  model?: string;
  promptPath: string;
  maxOutputTokens?: number;
  maxDeltaItems: number;
};

/**
 * Represents one dependency bundle used by thread-memory updater hook.
 */
export type ThreadMemoryUpdaterDependencies = {
  openPersonaDatabase: (personaId: string) => ProtegeDatabase;
  readState: (db: ProtegeDatabase, threadId: string) => ThreadMemoryState | undefined;
  readMessages: (db: ProtegeDatabase, threadId: string) => HarnessStoredMessage[];
  readToolEvents: (db: ProtegeDatabase, threadId: string) => HarnessThreadToolEvent[];
  writeState: (
    db: ProtegeDatabase,
    state: {
      threadId: string;
      personaId: string;
      summaryText: string;
      sourceMessageId?: string;
      sourceReceivedAt?: string;
      sourceToolEventAt?: string;
    },
  ) => void;
  synthesize: (args: {
    provider?: 'openai' | 'anthropic' | 'gemini' | 'grok';
    model?: string;
    promptPath: string;
    maxOutputTokens?: number;
    inputText: string;
  }) => Promise<{
    provider: 'openai' | 'anthropic' | 'gemini' | 'grok';
    model: string;
    outputText: string;
  }>;
  nowIso: () => string;
};

/**
 * Creates one thread-memory updater hook callback with injectable dependencies.
 */
export function createThreadMemoryUpdaterHook(
  deps: ThreadMemoryUpdaterDependencies = createDefaultThreadMemoryUpdaterDependencies(),
): (
  event: string,
  payload: HookEventPayloadByName[typeof HOOK_EVENT.HarnessInferenceCompleted],
  config: Record<string, unknown>,
) => Promise<HarnessHookResult> {
  return async (
    event,
    payload,
    config,
  ): Promise<HarnessHookResult> => {
    if (event !== HOOK_EVENT.HarnessInferenceCompleted) {
      return undefined;
    }

    const personaId = typeof payload.personaId === 'string'
      ? payload.personaId
      : '';
    const threadId = typeof payload.threadId === 'string'
      ? payload.threadId
      : '';
    if (personaId.length === 0 || threadId.length === 0) {
      return undefined;
    }

    const resolvedConfig = resolveThreadMemoryUpdaterConfig({ config });
    const db = deps.openPersonaDatabase(personaId);
    try {
      const previousState = deps.readState(db, threadId);
      const messages = deps.readMessages(db, threadId);
      const events = deps.readToolEvents(db, threadId);
      const delta = buildThreadDelta({
        messages,
        events,
        lastMessageReceivedAt: previousState?.sourceReceivedAt,
        lastToolEventAt: previousState?.sourceToolEventAt,
        maxDeltaItems: resolvedConfig.maxDeltaItems,
      });
      if (delta.items.length === 0) {
        return undefined;
      }

      const synthesisInputText = buildThreadSynthesisInput({
        previousSummary: previousState?.summaryText,
        deltaItems: delta.items,
      });
      const synthesis = await deps.synthesize({
        provider: resolvedConfig.provider,
        model: resolvedConfig.model,
        promptPath: resolvedConfig.promptPath,
        maxOutputTokens: resolvedConfig.maxOutputTokens,
        inputText: synthesisInputText,
      });
      deps.writeState(db, {
        threadId,
        personaId,
        summaryText: synthesis.outputText,
        sourceMessageId: delta.lastMessageId,
        sourceReceivedAt: delta.lastMessageReceivedAt,
        sourceToolEventAt: delta.lastToolEventAt,
      });

      return {
        emit: [
          {
            event: HOOK_EVENT.MemoryThreadUpdated,
            payload: {
              level: 'info',
              scope: 'memory',
              event: HOOK_EVENT.MemoryThreadUpdated,
              timestamp: deps.nowIso(),
              personaId,
              threadId,
              sourceMessageId: delta.lastMessageId ?? null,
              sourceReceivedAt: delta.lastMessageReceivedAt ?? null,
              sourceToolEventAt: delta.lastToolEventAt ?? null,
              synthesisProvider: synthesis.provider,
              synthesisModel: synthesis.model,
            },
          },
        ],
      };
    } finally {
      db.close();
    }
  };
}

/**
 * Runs thread-memory synthesis on `harness.inference.completed` and emits `memory.thread.updated`.
 */
export const onEvent = createThreadMemoryUpdaterHook();

/**
 * Creates default dependency wiring for thread-memory updater runtime behavior.
 */
export function createDefaultThreadMemoryUpdaterDependencies(): ThreadMemoryUpdaterDependencies {
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
    readState: (
      db,
      threadId,
    ): ThreadMemoryState | undefined => readThreadMemoryState({ db, threadId }),
    readMessages: (
      db,
      threadId,
    ): HarnessStoredMessage[] => listThreadMessages({ db, threadId }),
    readToolEvents: (
      db,
      threadId,
    ): HarnessThreadToolEvent[] => listThreadToolEventsByThread({ db, threadId }),
    writeState: (
      db,
      state,
    ): void => {
      upsertThreadMemoryState({
        db,
        state,
      });
    },
    synthesize: (args) => synthesizeMemoryText(args),
    nowIso: (): string => new Date().toISOString(),
  };
}

/**
 * Resolves thread-memory updater config with defaults.
 */
export function resolveThreadMemoryUpdaterConfig(
  args: {
    config: Record<string, unknown>;
  },
): ThreadMemoryUpdaterConfig {
  return {
    provider: readProviderValue({ value: args.config.provider }),
    model: readOptionalString({ value: args.config.model }),
    promptPath: readOptionalString({ value: args.config.prompt_path }) ?? 'prompts/thread-summary.md',
    maxOutputTokens: readOptionalNumber({ value: args.config.max_output_tokens }),
    maxDeltaItems: readPositiveInteger({
      value: args.config.max_delta_items,
      fallback: 24,
    }),
  };
}

/**
 * Represents one synthesized thread-delta item for prompt assembly.
 */
export type ThreadDeltaItem = {
  kind: 'message' | 'tool_event';
  id: string;
  at: string;
  text: string;
};

/**
 * Represents one derived thread delta payload.
 */
export type ThreadDelta = {
  items: ThreadDeltaItem[];
  lastMessageId?: string;
  lastMessageReceivedAt?: string;
  lastToolEventAt?: string;
};

/**
 * Builds delta timeline items from new messages and tool events after previous watermark.
 */
export function buildThreadDelta(
  args: {
    messages: HarnessStoredMessage[];
    events: HarnessThreadToolEvent[];
    lastMessageReceivedAt?: string;
    lastToolEventAt?: string;
    maxDeltaItems: number;
  },
): ThreadDelta {
  const newMessages = args.messages.filter((message) => {
    if (!args.lastMessageReceivedAt) {
      return true;
    }

    return message.receivedAt > args.lastMessageReceivedAt;
  });
  const newEvents = args.events.filter((event) => {
    if (!args.lastToolEventAt) {
      return true;
    }

    return event.createdAt > args.lastToolEventAt;
  });
  const timeline: ThreadDeltaItem[] = [
    ...newMessages.map((message) => ({
      kind: 'message' as const,
      id: message.messageId,
      at: message.receivedAt,
      text: `${message.direction.toUpperCase()} ${message.sender} :: ${message.subject}\n${message.textBody}`,
    })),
    ...newEvents.map((event) => ({
      kind: 'tool_event' as const,
      id: event.id,
      at: event.createdAt,
      text: `${event.eventType.toUpperCase()} ${event.toolName} (${event.toolCallId})\n${JSON.stringify(event.payload)}`,
    })),
  ].sort((left, right) => left.at.localeCompare(right.at));
  const items = timeline.slice(Math.max(0, timeline.length - args.maxDeltaItems));

  return {
    items,
    lastMessageId: args.messages[args.messages.length - 1]?.messageId,
    lastMessageReceivedAt: args.messages[args.messages.length - 1]?.receivedAt,
    lastToolEventAt: args.events[args.events.length - 1]?.createdAt,
  };
}

/**
 * Builds synthesis input text for thread-memory updates.
 */
export function buildThreadSynthesisInput(
  args: {
    previousSummary?: string;
    deltaItems: ThreadDeltaItem[];
  },
): string {
  const previousSummary = args.previousSummary?.trim().length
    ? args.previousSummary.trim()
    : '(none)';
  const deltaText = args.deltaItems.length === 0
    ? '(none)'
    : args.deltaItems.map((item, index) => `${index + 1}. [${item.at}] ${item.kind}\n${item.text}`).join('\n\n');

  return [
    'Previous Thread Memory Summary:',
    previousSummary,
    '',
    'Delta Since Last Synthesis:',
    deltaText,
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
): ThreadMemoryUpdaterConfig['provider'] {
  return args.value === 'openai'
    || args.value === 'anthropic'
    || args.value === 'gemini'
    || args.value === 'grok'
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
