import type { ProtegeDatabase } from '@engine/shared/database';

import type {
  HarnessStoredMessage,
  StoreInboundMessageRequest,
  StoreOutboundMessageRequest,
} from '@engine/harness/types';

import { randomUUID } from 'node:crypto';

/**
 * Upserts thread metadata for one inbound message and keeps updated_at current.
 */
export function ensureThread(
  args: {
    db: ProtegeDatabase;
    threadId: string;
    rootMessageId: string;
    nowIso: string;
  },
): void {
  args.db.prepare(`
    INSERT INTO threads (id, root_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(args.threadId, args.rootMessageId, args.nowIso, args.nowIso);
}

/**
 * Persists one inbound gateway message into harness thread history storage.
 */
export function storeInboundMessage(
  args: {
    db: ProtegeDatabase;
    request: StoreInboundMessageRequest;
  },
): HarnessStoredMessage {
  const nowIso = new Date().toISOString();
  ensureThread({
    db: args.db,
    threadId: args.request.message.threadId,
    rootMessageId: args.request.message.messageId,
    nowIso,
  });

  const id = randomUUID();
  const sender = args.request.message.from[0]?.address ?? '';
  const recipients = args.request.message.to.map((item) => item.address);
  const metadata = {
    references: args.request.message.references,
    cc: args.request.message.cc,
    bcc: args.request.message.bcc,
    envelopeRcptTo: args.request.message.envelopeRcptTo,
    attachments: args.request.message.attachments,
  };

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
    id,
    args.request.message.threadId,
    'inbound',
    args.request.message.messageId,
    null,
    sender,
    JSON.stringify(recipients),
    args.request.message.subject,
    args.request.message.text,
    args.request.message.html ?? null,
    args.request.message.receivedAt,
    args.request.message.rawMimePath,
    JSON.stringify(metadata),
  );

  return {
    id,
    threadId: args.request.message.threadId,
    direction: 'inbound',
    messageId: args.request.message.messageId,
    sender,
    recipients,
    subject: args.request.message.subject,
    textBody: args.request.message.text,
    htmlBody: args.request.message.html,
    receivedAt: args.request.message.receivedAt,
    rawMimePath: args.request.message.rawMimePath,
    metadata,
  };
}

/**
 * Persists one outbound harness message into thread history storage.
 */
export function storeOutboundMessage(
  args: {
    db: ProtegeDatabase;
    request: StoreOutboundMessageRequest;
  },
): HarnessStoredMessage {
  const nowIso = new Date().toISOString();
  ensureThread({
    db: args.db,
    threadId: args.request.threadId,
    rootMessageId: args.request.inReplyTo,
    nowIso,
  });

  const id = randomUUID();
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
    id,
    args.request.threadId,
    'outbound',
    args.request.messageId,
    args.request.inReplyTo,
    args.request.sender,
    JSON.stringify(args.request.recipients),
    args.request.subject,
    args.request.text,
    null,
    args.request.receivedAt,
    '__generated__',
    JSON.stringify(args.request.metadata),
  );

  return {
    id,
    threadId: args.request.threadId,
    direction: 'outbound',
    messageId: args.request.messageId,
    inReplyTo: args.request.inReplyTo,
    sender: args.request.sender,
    recipients: args.request.recipients,
    subject: args.request.subject,
    textBody: args.request.text,
    receivedAt: args.request.receivedAt,
    rawMimePath: '__generated__',
    metadata: args.request.metadata,
  };
}

/**
 * Lists stored messages for one thread in ascending receive order.
 */
export function listThreadMessages(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): HarnessStoredMessage[] {
  const rows = args.db.prepare(`
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
      raw_mime_path,
      metadata_json
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at ASC
  `).all(args.threadId) as Array<Record<string, string | null>>;

  return rows.map((row) => ({
    id: row.id ?? '',
    threadId: row.thread_id ?? '',
    direction: (row.direction ?? 'inbound') as HarnessStoredMessage['direction'],
    messageId: row.message_id ?? '',
    inReplyTo: row.in_reply_to ?? undefined,
    sender: row.sender ?? '',
    recipients: JSON.parse(row.recipients ?? '[]') as string[],
    subject: row.subject ?? '',
    textBody: row.text_body ?? '',
    htmlBody: row.html_body ?? undefined,
    receivedAt: row.received_at ?? '',
    rawMimePath: row.raw_mime_path ?? '',
    metadata: JSON.parse(row.metadata_json ?? '{}') as Record<string, unknown>,
  }));
}

/**
 * Searches stored thread messages using SQLite FTS over subject and text body.
 */
export function searchMessages(
  args: {
    db: ProtegeDatabase;
    query: string;
    limit?: number;
  },
): Array<{
  messagePk: string;
  threadId: string;
  subject: string;
  textBody: string;
}> {
  const rows = args.db.prepare(`
    SELECT message_pk, thread_id, subject, text_body
    FROM messages_fts
    WHERE messages_fts MATCH ?
    LIMIT ?
  `).all(args.query, args.limit ?? 20) as Array<Record<string, string>>;

  return rows.map((row) => ({
    messagePk: row.message_pk,
    threadId: row.thread_id,
    subject: row.subject,
    textBody: row.text_body,
  }));
}
