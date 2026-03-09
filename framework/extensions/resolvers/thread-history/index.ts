import type { HarnessResolverDefinition } from '@protege-pack/toolkit';
import type { HarnessContextHistoryEntry } from '@protege-pack/toolkit';

type ThreadToolEvent = {
  id: string;
  parentMessageId: string;
  stepIndex: number;
  eventType: 'tool_call' | 'tool_result';
  toolName: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type DatabaseLike = {
  prepare: (
    sql: string,
  ) => {
    all: (
      params: Record<string, unknown>,
    ) => Array<Record<string, unknown>>;
  };
};

/**
 * Loads and trims thread history entries for provider context continuity.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'thread-history',
  resolve: ({ invocation }) => {
    const db = isDatabaseLike(invocation.context.db)
      ? invocation.context.db
      : undefined;
    const threadId = typeof invocation.context.threadId === 'string'
      ? invocation.context.threadId
      : '';
    const maxHistoryTokens = typeof invocation.context.maxHistoryTokens === 'number'
      ? invocation.context.maxHistoryTokens
      : 1200;
    if (!db || threadId.length === 0) {
      return null;
    }

    const history = buildHistoryEntries({
      db,
      threadId,
    });
    const trimmedHistory = truncateHistoryToTokenBudget({
      history,
      maxHistoryTokens,
    });

    return {
      history: trimmedHistory,
    };
  },
};

/**
 * Builds one ordered thread history timeline from persisted messages and tool events.
 */
function buildHistoryEntries(
  args: {
    db: DatabaseLike;
    threadId: string;
  },
): HarnessContextHistoryEntry[] {
  const messages = readThreadMessages({
    db: args.db,
    threadId: args.threadId,
  });
  const toolEventsByMessageId = groupToolEventsByParentMessageId({
    events: readThreadToolEvents({
      db: args.db,
      threadId: args.threadId,
    }),
  });
  const history: HarnessContextHistoryEntry[] = [];

  for (const message of messages) {
    history.push({
      direction: message.direction,
      sender: message.sender,
      subject: message.subject,
      text: message.text,
      receivedAt: message.receivedAt,
      messageId: message.messageId,
    });
    const events = toolEventsByMessageId.get(message.messageId) ?? [];
    for (const event of events) {
      history.push(toToolHistoryEntry({ event }));
    }
  }

  return history;
}

/**
 * Reads ordered thread messages from temporal storage.
 */
function readThreadMessages(
  args: {
    db: DatabaseLike;
    threadId: string;
  },
): HarnessContextHistoryEntry[] {
  const rows = args.db.prepare(
    `SELECT direction, sender, subject, text_body, received_at, message_id
       FROM messages
      WHERE thread_id = @threadId
      ORDER BY received_at ASC, id ASC`,
  ).all({
    threadId: args.threadId,
  });

  return rows.map((row) => ({
    direction: readHistoryDirection({
      value: row.direction,
    }),
    sender: typeof row.sender === 'string' ? row.sender : 'unknown',
    subject: typeof row.subject === 'string' ? row.subject : '',
    text: typeof row.text_body === 'string' ? row.text_body : '',
    receivedAt: typeof row.received_at === 'string' ? row.received_at : new Date().toISOString(),
    messageId: typeof row.message_id === 'string' ? row.message_id : '',
  }));
}

/**
 * Reads ordered thread tool events from temporal storage.
 */
function readThreadToolEvents(
  args: {
    db: DatabaseLike;
    threadId: string;
  },
): ThreadToolEvent[] {
  const rows = args.db.prepare(
    `SELECT id, parent_message_id, step_index, event_type, tool_name, payload_json, created_at
       FROM thread_tool_events
      WHERE thread_id = @threadId
      ORDER BY created_at ASC, id ASC`,
  ).all({
    threadId: args.threadId,
  });

  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    parentMessageId: typeof row.parent_message_id === 'string' ? row.parent_message_id : '',
    stepIndex: typeof row.step_index === 'number' ? row.step_index : 0,
    eventType: row.event_type === 'tool_result' ? 'tool_result' : 'tool_call',
    toolName: typeof row.tool_name === 'string' ? row.tool_name : 'unknown',
    payload: parsePayloadJson({
      value: row.payload_json,
    }),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }));
}

/**
 * Groups tool events by their parent inbound message id.
 */
function groupToolEventsByParentMessageId(
  args: {
    events: ThreadToolEvent[];
  },
): Map<string, ThreadToolEvent[]> {
  const grouped = new Map<string, ThreadToolEvent[]>();
  for (const event of args.events) {
    const existing = grouped.get(event.parentMessageId) ?? [];
    existing.push(event);
    grouped.set(event.parentMessageId, existing);
  }

  for (const [messageId, events] of grouped.entries()) {
    grouped.set(messageId, events.sort((left, right) => left.stepIndex - right.stepIndex));
  }

  return grouped;
}

/**
 * Converts one stored thread tool event into a synthetic history entry.
 */
function toToolHistoryEntry(
  args: {
    event: ThreadToolEvent;
  },
): HarnessContextHistoryEntry {
  const label = args.event.eventType === 'tool_call' ? 'Tool call' : 'Tool result';
  return {
    direction: 'synthetic',
    sender: 'tool@protege.local',
    subject: `${label}: ${args.event.toolName}`,
    text: `${label} (${args.event.toolName}): ${JSON.stringify(args.event.payload)}`,
    receivedAt: args.event.createdAt,
    messageId: `tool-event:${args.event.id}`,
  };
}

/**
 * Truncates history by approximate token budget while preserving newest entries.
 */
function truncateHistoryToTokenBudget(
  args: {
    history: HarnessContextHistoryEntry[];
    maxHistoryTokens: number;
  },
): HarnessContextHistoryEntry[] {
  const selected: HarnessContextHistoryEntry[] = [];
  let runningTotal = 0;
  for (let index = args.history.length - 1; index >= 0; index -= 1) {
    const entry = args.history[index];
    const cost = estimateTokens({
      value: `${entry.subject}\n${entry.text}`,
    });
    if (runningTotal + cost > args.maxHistoryTokens) {
      continue;
    }

    selected.push(entry);
    runningTotal += cost;
  }

  return selected.reverse();
}

/**
 * Approximates token count from character length.
 */
function estimateTokens(
  args: {
    value: string;
  },
): number {
  return Math.ceil(args.value.length / 4);
}

/**
 * Parses one JSON payload value into object form.
 */
function parsePayloadJson(
  args: {
    value: unknown;
  },
): Record<string, unknown> {
  if (typeof args.value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(args.value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Reads one persisted message direction into known history direction union.
 */
function readHistoryDirection(
  args: {
    value: unknown;
  },
): HarnessContextHistoryEntry['direction'] {
  if (args.value === 'inbound' || args.value === 'outbound' || args.value === 'synthetic') {
    return args.value;
  }

  return 'inbound';
}

/**
 * Returns true when one unknown value satisfies minimal db contract.
 */
function isDatabaseLike(
  value: unknown,
): value is DatabaseLike {
  return isRecord(value) && typeof value.prepare === 'function';
}

/**
 * Returns true when one unknown value is a plain object.
 */
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
