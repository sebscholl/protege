import type { ProtegeDatabase } from '@engine/shared/database';

import { randomUUID } from 'node:crypto';

/**
 * Represents one aggregated thread activity row used for chat inbox list queries.
 */
export type ChatThreadActivityRow = {
  threadId: string;
  lastReceivedAt: string;
  messageCount: number;
};

/**
 * Represents one raw message projection row used by chat read models.
 */
export type ChatMessageProjectionRow = Record<string, string | null>;

/**
 * Represents one first-message metadata row used to classify writable chat threads.
 */
export type ChatFirstMessageMetadataRow = Record<string, unknown>;

/**
 * Represents one latest-message preview row used for inbox summary rendering.
 */
export type ChatLastMessagePreviewRow = Record<string, string | undefined>;

/**
 * Lists thread activity rows ordered by latest message timestamp.
 */
export function listThreadActivityRows(
  args: {
    db: ProtegeDatabase;
    limit: number;
  },
): ChatThreadActivityRow[] {
  const rows = args.db.prepare(`
    SELECT thread_id, MAX(received_at) AS last_received_at, COUNT(*) AS message_count
    FROM messages
    GROUP BY thread_id
    ORDER BY last_received_at DESC
    LIMIT ?
  `).all(args.limit) as Array<{
    thread_id?: string;
    last_received_at?: string;
    message_count?: number;
  }>;

  return rows.map((row) => ({
    threadId: row.thread_id ?? '',
    lastReceivedAt: row.last_received_at ?? '',
    messageCount: typeof row.message_count === 'number' ? row.message_count : 0,
  }));
}

/**
 * Lists all message rows for one thread in chronological order.
 */
export function listThreadMessageRows(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): ChatMessageProjectionRow[] {
  return args.db.prepare(`
    SELECT
      id,
      thread_id,
      direction,
      message_id,
      in_reply_to,
      sender,
      recipients,
      subject,
      text_body,
      html_body,
      received_at,
      metadata_json
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at ASC
  `).all(args.threadId) as Array<Record<string, string | null>>;
}

/**
 * Reads the earliest message metadata row for one thread.
 */
export function readFirstThreadMessageMetadataRow(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): ChatFirstMessageMetadataRow | undefined {
  return args.db.prepare(`
    SELECT direction, sender, recipients, metadata_json
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at ASC
    LIMIT 1
  `).get(args.threadId) as Record<string, unknown> | undefined;
}

/**
 * Reads the latest message preview row for one thread.
 */
export function readLastThreadMessagePreviewRow(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): ChatLastMessagePreviewRow | undefined {
  return args.db.prepare(`
    SELECT subject, sender, text_body
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get(args.threadId) as Record<string, string | undefined> | undefined;
}

/**
 * Reads canonical thread subject from thread root message linkage.
 */
export function readThreadRootSubjectByRootMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): string | undefined {
  const row = args.db.prepare(`
    SELECT m.subject
    FROM threads t
    JOIN messages m
      ON m.thread_id = t.id
     AND m.message_id = t.root_message_id
    WHERE t.id = ?
    LIMIT 1
  `).get(args.threadId) as {
    subject?: string;
  } | undefined;
  return row?.subject;
}

/**
 * Reads one latest message id for one thread.
 */
export function readLastThreadMessageId(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): string | undefined {
  const row = args.db.prepare(`
    SELECT message_id
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get(args.threadId) as {
    message_id?: string;
  } | undefined;
  return row?.message_id;
}

/**
 * Reads one canonical thread subject from earliest thread message.
 */
export function readThreadSubject(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): string {
  const row = args.db.prepare(`
    SELECT subject
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at ASC
    LIMIT 1
  `).get(args.threadId) as {
    subject?: string;
  } | undefined;
  return row?.subject ?? 'Local Chat';
}

/**
 * Inserts one local synthetic seed message row for writable local chat thread creation.
 */
export function insertLocalSyntheticSeedMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
    messageId: string;
    personaMailboxIdentity: string;
    subject: string;
    receivedAt: string;
  },
): void {
  args.db.prepare(`
    INSERT INTO messages (
      id,
      thread_id,
      direction,
      message_id,
      in_reply_to,
      sender,
      recipients,
      subject,
      text_body,
      html_body,
      received_at,
      raw_mime_path,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    args.threadId,
    'synthetic',
    args.messageId,
    null,
    'user@localhost',
    JSON.stringify([args.personaMailboxIdentity]),
    args.subject,
    '',
    null,
    args.receivedAt,
    '__chat_local_seed__',
    JSON.stringify({ chat_local_thread: true, chat_local_seed: true }),
  );
}

/**
 * Inserts one local synthetic user message row in a writable local chat thread.
 */
export function insertLocalSyntheticUserMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
    messageId: string;
    inReplyTo?: string;
    personaMailboxIdentity: string;
    subject: string;
    text: string;
    receivedAt: string;
  },
): void {
  args.db.prepare(`
    INSERT INTO messages (
      id,
      thread_id,
      direction,
      message_id,
      in_reply_to,
      sender,
      recipients,
      subject,
      text_body,
      html_body,
      received_at,
      raw_mime_path,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    args.threadId,
    'synthetic',
    args.messageId,
    args.inReplyTo ?? null,
    'user@localhost',
    JSON.stringify([args.personaMailboxIdentity]),
    args.subject,
    args.text,
    null,
    args.receivedAt,
    '__chat_local_message__',
    JSON.stringify({ chat_local_thread: true, chat_local_user_message: true }),
  );
}
