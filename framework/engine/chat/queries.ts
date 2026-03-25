import type { ProtegeDatabase } from '@engine/shared/database';

import {
  listThreadActivityRows,
  listThreadMessageRows,
  readFirstThreadMessageMetadataRow,
  readLastThreadMessagePreviewRow,
  readThreadRootSubjectByRootMessage,
} from '@engine/chat/repository';

/**
 * Represents one inbox-row summary record for chat thread listing.
 */
export type ChatThreadSummary = {
  threadId: string;
  subject: string;
  lastSender: string;
  lastReceivedAt: string;
  preview: string;
  messageCount: number;
  isReadOnly: boolean;
};

/**
 * Represents one normalized chat message row for thread detail rendering.
 */
export type ChatThreadMessage = {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound' | 'synthetic';
  messageId: string;
  inReplyTo?: string;
  sender: string;
  recipients: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
  attachmentPaths: string[];
};

/**
 * Represents one thread detail payload used by chat thread view rendering.
 */
export type ChatThreadDetail = {
  threadId: string;
  subject: string;
  messages: ChatThreadMessage[];
  isReadOnly: boolean;
};

/**
 * Lists persona-scoped chat thread summaries in reverse activity order.
 */
export function listChatThreadSummaries(
  args: {
    db: ProtegeDatabase;
    personaMailboxIdentity: string;
    limit?: number;
  },
): ChatThreadSummary[] {
  const rows = listThreadActivityRows({
    db: args.db,
    limit: args.limit ?? 100,
  });

  return rows.map((row) => {
    const threadId = row.threadId;
    const messageCount = row.messageCount;
    const lastMessage = readLastThreadMessage({
      db: args.db,
      threadId,
    });
    const rootSubject = readThreadRootSubject({
      db: args.db,
      threadId,
    });
    const firstMessage = readFirstThreadMessage({
      db: args.db,
      threadId,
    });
    const isReadOnly = !isWritableLocalSyntheticThread({
      firstMessage,
      personaMailboxIdentity: args.personaMailboxIdentity,
    });
    return {
      threadId,
      subject: rootSubject ?? lastMessage?.subject ?? '',
      lastSender: lastMessage?.sender ?? '',
      lastReceivedAt: row.lastReceivedAt,
      preview: buildChatPreview({
        value: lastMessage?.text_body ?? '',
      }),
      messageCount,
      isReadOnly,
    };
  });
}

/**
 * Reads one chat thread detail payload for timeline rendering.
 */
export function readChatThreadDetail(
  args: {
    db: ProtegeDatabase;
    threadId: string;
    personaMailboxIdentity: string;
  },
): ChatThreadDetail {
  const rows = listThreadMessageRows({
    db: args.db,
    threadId: args.threadId,
  });

  const allMessages = rows.map((row) => parseChatThreadMessageRow({ row }));
  const messages = allMessages.filter((message) => !isSeedMessage({ message }));
  const firstMessage = rows.length > 0 ? rows[0] : undefined;
  const isReadOnly = !isWritableLocalSyntheticThread({
    firstMessage,
    personaMailboxIdentity: args.personaMailboxIdentity,
  });
  return {
    threadId: args.threadId,
    subject: allMessages[0]?.subject ?? '',
    messages,
    isReadOnly,
  };
}

/**
 * Parses one database message row into chat thread message shape.
 */
export function parseChatThreadMessageRow(
  args: {
    row: Record<string, string | null>;
  },
): ChatThreadMessage {
  const metadata = safeParseRecord({
    value: args.row.metadata_json,
  });
  return {
    id: args.row.id ?? '',
    threadId: args.row.thread_id ?? '',
    direction: parseMessageDirection({
      value: args.row.direction,
    }),
    messageId: args.row.message_id ?? '',
    inReplyTo: args.row.in_reply_to ?? undefined,
    sender: args.row.sender ?? '',
    recipients: safeParseStringArray({
      value: args.row.recipients,
    }),
    subject: args.row.subject ?? '',
    textBody: args.row.text_body ?? '',
    htmlBody: args.row.html_body ?? undefined,
    receivedAt: args.row.received_at ?? '',
    metadata,
    attachmentPaths: extractAttachmentPaths({
      metadata,
    }),
  };
}

/**
 * Extracts attachment file paths from message metadata for chat rendering.
 */
export function extractAttachmentPaths(
  args: {
    metadata: Record<string, unknown>;
  },
): string[] {
  const attachments = args.metadata.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => {
      if (typeof attachment !== 'object' || attachment === null || Array.isArray(attachment)) {
        return '';
      }
      const entry = attachment as Record<string, unknown>;
      if (typeof entry.storagePath === 'string' && entry.storagePath.trim().length > 0) {
        return entry.storagePath;
      }
      if (typeof entry.path === 'string' && entry.path.trim().length > 0) {
        return entry.path;
      }
      return '';
    })
    .filter((path) => path.length > 0);
}

/**
 * Returns one normalized preview string from a raw message body.
 */
export function buildChatPreview(
  args: {
    value: string;
    maxLength?: number;
  },
): string {
  const compact = args.value.replace(/\s+/g, ' ').trim();
  if (compact.length <= (args.maxLength ?? 120)) {
    return compact;
  }

  return `${compact.slice(0, (args.maxLength ?? 120) - 1)}…`;
}

/**
 * Returns true when one message is the synthetic seed inserted at thread creation.
 */
export function isSeedMessage(
  args: {
    message: ChatThreadMessage;
  },
): boolean {
  return args.message.metadata.chat_local_seed === true;
}

/**
 * Returns true when one thread is a writable local synthetic chat thread.
 */
export function isWritableLocalSyntheticThread(
  args: {
    firstMessage?: Record<string, unknown>;
    personaMailboxIdentity: string;
  },
): boolean {
  if (!args.firstMessage) {
    return false;
  }

  const direction = args.firstMessage.direction;
  const sender = args.firstMessage.sender;
  const recipients = safeParseStringArray({
    value: args.firstMessage.recipients as string | undefined,
  });
  const metadata = safeParseRecord({
    value: args.firstMessage.metadata_json as string | undefined,
  });

  return direction === 'synthetic'
    && sender === 'user@localhost'
    && recipients.includes(args.personaMailboxIdentity)
    && metadata.chat_local_thread === true;
}

/**
 * Reads the earliest message row for one thread.
 */
export function readFirstThreadMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): Record<string, unknown> | undefined {
  return readFirstThreadMessageMetadataRow({
    db: args.db,
    threadId: args.threadId,
  });
}

/**
 * Reads one canonical root subject from thread root_message_id linkage.
 */
export function readThreadRootSubject(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): string | undefined {
  return readThreadRootSubjectByRootMessage({
    db: args.db,
    threadId: args.threadId,
  });
}

/**
 * Reads the latest message row for one thread.
 */
export function readLastThreadMessage(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): Record<string, string | undefined> | undefined {
  return readLastThreadMessagePreviewRow({
    db: args.db,
    threadId: args.threadId,
  });
}

/**
 * Parses one direction value into supported message direction union.
 */
export function parseMessageDirection(
  args: {
    value: string | null;
  },
): 'inbound' | 'outbound' | 'synthetic' {
  if (args.value === 'outbound' || args.value === 'synthetic') {
    return args.value;
  }

  return 'inbound';
}

/**
 * Safely parses one serialized JSON array into string array output.
 */
export function safeParseStringArray(
  args: {
    value: string | null | undefined;
  },
): string[] {
  if (!args.value) {
    return [];
  }

  try {
    const parsed = JSON.parse(args.value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

/**
 * Safely parses one serialized JSON object into record output.
 */
export function safeParseRecord(
  args: {
    value: string | null | undefined;
  },
): Record<string, unknown> {
  if (!args.value) {
    return {};
  }

  try {
    const parsed = JSON.parse(args.value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
