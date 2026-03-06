import type { ProtegeDatabase } from '@engine/shared/database';

/**
 * Represents one stored thread memory state row.
 */
export type ThreadMemoryState = {
  threadId: string;
  personaId: string;
  summaryText: string;
  sourceMessageId?: string;
  sourceReceivedAt?: string;
  sourceToolEventAt?: string;
  updatedAt: string;
};

/**
 * Represents one stored persona memory synthesis state row.
 */
export type PersonaMemorySynthesisState = {
  personaId: string;
  dirty: boolean;
  dirtySince?: string;
  lastTriggerThreadId?: string;
  lastTriggeredAt?: string;
  lastSynthesizedAt?: string;
  lastErrorMessage?: string;
  updatedAt: string;
};

/**
 * Reads persisted thread-memory state for one thread when available.
 */
export function readThreadMemoryState(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): ThreadMemoryState | undefined {
  const row = args.db.prepare(`
    SELECT
      thread_id,
      persona_id,
      summary_text,
      source_message_id,
      source_received_at,
      source_tool_event_at,
      updated_at
    FROM thread_memory_states
    WHERE thread_id = ?
  `).get(args.threadId) as Record<string, unknown> | undefined;
  if (!row) {
    return undefined;
  }

  return {
    threadId: String(row.thread_id ?? ''),
    personaId: String(row.persona_id ?? ''),
    summaryText: String(row.summary_text ?? ''),
    sourceMessageId: readOptionalString({ value: row.source_message_id }),
    sourceReceivedAt: readOptionalString({ value: row.source_received_at }),
    sourceToolEventAt: readOptionalString({ value: row.source_tool_event_at }),
    updatedAt: String(row.updated_at ?? ''),
  };
}

/**
 * Upserts thread-memory summary state for one thread.
 */
export function upsertThreadMemoryState(
  args: {
    db: ProtegeDatabase;
    state: {
      threadId: string;
      personaId: string;
      summaryText: string;
      sourceMessageId?: string;
      sourceReceivedAt?: string;
      sourceToolEventAt?: string;
      updatedAt?: string;
    };
  },
): ThreadMemoryState {
  const updatedAt = args.state.updatedAt ?? new Date().toISOString();
  args.db.prepare(`
    INSERT INTO thread_memory_states (
      thread_id,
      persona_id,
      summary_text,
      source_message_id,
      source_received_at,
      source_tool_event_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      persona_id = excluded.persona_id,
      summary_text = excluded.summary_text,
      source_message_id = excluded.source_message_id,
      source_received_at = excluded.source_received_at,
      source_tool_event_at = excluded.source_tool_event_at,
      updated_at = excluded.updated_at
  `).run(
    args.state.threadId,
    args.state.personaId,
    args.state.summaryText,
    args.state.sourceMessageId ?? null,
    args.state.sourceReceivedAt ?? null,
    args.state.sourceToolEventAt ?? null,
    updatedAt,
  );

  return {
    threadId: args.state.threadId,
    personaId: args.state.personaId,
    summaryText: args.state.summaryText,
    sourceMessageId: args.state.sourceMessageId,
    sourceReceivedAt: args.state.sourceReceivedAt,
    sourceToolEventAt: args.state.sourceToolEventAt,
    updatedAt,
  };
}

/**
 * Reads persisted persona memory synthesis state when available.
 */
export function readPersonaMemorySynthesisState(
  args: {
    db: ProtegeDatabase;
    personaId: string;
  },
): PersonaMemorySynthesisState | undefined {
  const row = args.db.prepare(`
    SELECT
      persona_id,
      dirty,
      dirty_since,
      last_trigger_thread_id,
      last_triggered_at,
      last_synthesized_at,
      last_error_message,
      updated_at
    FROM persona_memory_synthesis_state
    WHERE persona_id = ?
  `).get(args.personaId) as Record<string, unknown> | undefined;
  if (!row) {
    return undefined;
  }

  return toPersonaMemorySynthesisState({ row });
}

/**
 * Marks one persona as dirty after thread-memory state updates.
 */
export function markPersonaMemoryDirty(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    triggerThreadId: string;
    triggeredAt?: string;
  },
): PersonaMemorySynthesisState {
  const nowIso = args.triggeredAt ?? new Date().toISOString();
  args.db.prepare(`
    INSERT INTO persona_memory_synthesis_state (
      persona_id,
      dirty,
      dirty_since,
      last_trigger_thread_id,
      last_triggered_at,
      last_synthesized_at,
      last_error_message,
      updated_at
    ) VALUES (?, 1, ?, ?, ?, NULL, NULL, ?)
    ON CONFLICT(persona_id) DO UPDATE SET
      dirty = 1,
      dirty_since = CASE
        WHEN persona_memory_synthesis_state.dirty = 1
          THEN persona_memory_synthesis_state.dirty_since
        ELSE excluded.dirty_since
      END,
      last_trigger_thread_id = excluded.last_trigger_thread_id,
      last_triggered_at = excluded.last_triggered_at,
      last_error_message = NULL,
      updated_at = excluded.updated_at
  `).run(
    args.personaId,
    nowIso,
    args.triggerThreadId,
    nowIso,
    nowIso,
  );

  return readPersonaMemorySynthesisState({
    db: args.db,
    personaId: args.personaId,
  }) as PersonaMemorySynthesisState;
}

/**
 * Clears dirty state after one successful active-memory synthesis.
 */
export function clearPersonaMemoryDirty(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    synthesizedAt?: string;
  },
): PersonaMemorySynthesisState {
  const nowIso = args.synthesizedAt ?? new Date().toISOString();
  args.db.prepare(`
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
    ON CONFLICT(persona_id) DO UPDATE SET
      dirty = 0,
      dirty_since = NULL,
      last_synthesized_at = excluded.last_synthesized_at,
      last_error_message = NULL,
      updated_at = excluded.updated_at
  `).run(
    args.personaId,
    nowIso,
    nowIso,
  );

  return readPersonaMemorySynthesisState({
    db: args.db,
    personaId: args.personaId,
  }) as PersonaMemorySynthesisState;
}

/**
 * Stores synthesis failure message while leaving dirty state enabled.
 */
export function setPersonaMemoryDirtyFailure(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    errorMessage: string;
    updatedAt?: string;
  },
): PersonaMemorySynthesisState {
  const nowIso = args.updatedAt ?? new Date().toISOString();
  args.db.prepare(`
    INSERT INTO persona_memory_synthesis_state (
      persona_id,
      dirty,
      dirty_since,
      last_trigger_thread_id,
      last_triggered_at,
      last_synthesized_at,
      last_error_message,
      updated_at
    ) VALUES (?, 1, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(persona_id) DO UPDATE SET
      dirty = 1,
      dirty_since = COALESCE(persona_memory_synthesis_state.dirty_since, excluded.dirty_since),
      last_error_message = excluded.last_error_message,
      updated_at = excluded.updated_at
  `).run(
    args.personaId,
    nowIso,
    args.errorMessage,
    nowIso,
  );

  return readPersonaMemorySynthesisState({
    db: args.db,
    personaId: args.personaId,
  }) as PersonaMemorySynthesisState;
}

/**
 * Lists most recently updated thread-memory states for one persona.
 */
export function listThreadMemoryStatesByPersona(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    limit: number;
  },
): ThreadMemoryState[] {
  const rows = args.db.prepare(`
    SELECT
      thread_id,
      persona_id,
      summary_text,
      source_message_id,
      source_received_at,
      source_tool_event_at,
      updated_at
    FROM thread_memory_states
    WHERE persona_id = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(args.personaId, args.limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    threadId: String(row.thread_id ?? ''),
    personaId: String(row.persona_id ?? ''),
    summaryText: String(row.summary_text ?? ''),
    sourceMessageId: readOptionalString({ value: row.source_message_id }),
    sourceReceivedAt: readOptionalString({ value: row.source_received_at }),
    sourceToolEventAt: readOptionalString({ value: row.source_tool_event_at }),
    updatedAt: String(row.updated_at ?? ''),
  }));
}

/**
 * Converts one raw row record into typed persona-memory synthesis state.
 */
export function toPersonaMemorySynthesisState(
  args: {
    row: Record<string, unknown>;
  },
): PersonaMemorySynthesisState {
  return {
    personaId: String(args.row.persona_id ?? ''),
    dirty: Number(args.row.dirty ?? 0) === 1,
    dirtySince: readOptionalString({ value: args.row.dirty_since }),
    lastTriggerThreadId: readOptionalString({ value: args.row.last_trigger_thread_id }),
    lastTriggeredAt: readOptionalString({ value: args.row.last_triggered_at }),
    lastSynthesizedAt: readOptionalString({ value: args.row.last_synthesized_at }),
    lastErrorMessage: readOptionalString({ value: args.row.last_error_message }),
    updatedAt: String(args.row.updated_at ?? ''),
  };
}

/**
 * Reads one optional string from unknown row value.
 */
export function readOptionalString(
  args: {
    value: unknown;
  },
): string | undefined {
  return typeof args.value === 'string' && args.value.length > 0
    ? args.value
    : undefined;
}
