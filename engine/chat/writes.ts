import type { ProtegeDatabase } from '@engine/shared/database';

import { createHash, randomUUID } from 'node:crypto';

import { ensureThread } from '@engine/harness/storage';

/**
 * Represents one created local chat thread seed result.
 */
export type LocalChatThreadSeed = {
  threadId: string;
  messageId: string;
  subject: string;
  receivedAt: string;
};

/**
 * Represents one stored local chat user message result.
 */
export type LocalChatUserMessage = {
  threadId: string;
  messageId: string;
  inReplyTo?: string;
  subject: string;
  text: string;
  receivedAt: string;
};

/**
 * Creates one local synthetic writable thread seed message for chat inbox action.
 */
export function createLocalChatThreadSeed(
  args: {
    db: ProtegeDatabase;
    personaMailboxIdentity: string;
    now?: Date;
  },
): LocalChatThreadSeed {
  const now = args.now ?? new Date();
  const receivedAt = now.toISOString();
  const subject = buildLocalChatSubject({
    now,
  });
  const messageId = buildLocalSyntheticMessageId({
    now,
  });
  const threadId = buildLocalThreadId({
    rootMessageId: messageId,
  });

  ensureThread({
    db: args.db,
    threadId,
    rootMessageId: messageId,
    nowIso: receivedAt,
  });
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
    threadId,
    'synthetic',
    messageId,
    null,
    'user@localhost',
    JSON.stringify([args.personaMailboxIdentity]),
    subject,
    '',
    null,
    receivedAt,
    '__chat_local_seed__',
    JSON.stringify({ chat_local_thread: true, chat_local_seed: true }),
  );

  return {
    threadId,
    messageId,
    subject,
    receivedAt,
  };
}

/**
 * Stores one local synthetic user message in an existing writable chat thread.
 */
export function storeLocalChatUserMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
    personaMailboxIdentity: string;
    text: string;
    now?: Date;
  },
): LocalChatUserMessage {
  const now = args.now ?? new Date();
  const receivedAt = now.toISOString();
  const messageId = buildLocalSyntheticMessageId({
    now,
  });
  const previousMessageId = readLastThreadMessageId({
    db: args.db,
    threadId: args.threadId,
  });
  const subject = readThreadSubject({
    db: args.db,
    threadId: args.threadId,
  });

  ensureThread({
    db: args.db,
    threadId: args.threadId,
    rootMessageId: previousMessageId ?? messageId,
    nowIso: receivedAt,
  });
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
    messageId,
    previousMessageId ?? null,
    'user@localhost',
    JSON.stringify([args.personaMailboxIdentity]),
    subject,
    args.text,
    null,
    receivedAt,
    '__chat_local_message__',
    JSON.stringify({ chat_local_thread: true, chat_local_user_message: true }),
  );

  return {
    threadId: args.threadId,
    messageId,
    inReplyTo: previousMessageId ?? undefined,
    subject,
    text: args.text,
    receivedAt,
  };
}

/**
 * Builds deterministic local chat subject text from timestamp.
 */
export function buildLocalChatSubject(
  args: {
    now: Date;
  },
): string {
  return `Local Chat ${args.now.toISOString().replace('T', ' ').slice(0, 19)}`;
}

/**
 * Builds one synthetic local message id value for local chat persistence.
 */
export function buildLocalSyntheticMessageId(
  args: {
    now: Date;
  },
): string {
  return `<chat.${args.now.getTime()}.${randomUUID()}@localhost>`;
}

/**
 * Builds one local thread id hash from the root synthetic message id.
 */
export function buildLocalThreadId(
  args: {
    rootMessageId: string;
  },
): string {
  return createHash('sha256').update(args.rootMessageId.toLowerCase()).digest('hex');
}

/**
 * Reads one latest message id value for one thread.
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
 * Reads one canonical subject value for one thread from earliest message.
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
