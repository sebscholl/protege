import type { ProtegeDatabase } from '@engine/shared/database';
import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listChatThreadSummaries, readChatThreadDetail } from '@engine/chat/queries';
import { ensureThread, storeInboundMessage, storeOutboundMessage } from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let summariesThreadIds: string[] = [];
let summariesReadOnlyStates: boolean[] = [];
let firstSummaryPreview = '';
let summariesSubjects: string[] = [];
let localThreadDetailReadOnly = true;
let localThreadMessageCount = 0;
let externalThreadDetailReadOnly = false;
let externalThreadMessageCount = 0;
let externalThreadAttachmentPath = '';
let unknownThreadMessageCount = -1;
let unknownThreadReadOnly = false;

const personaMailboxIdentity = 'persona-1@localhost';
const externalThreadId = 'thread-external';
const localSyntheticThreadId = 'thread-local-synthetic';

/**
 * Returns one inbound fixture message for external-thread storage setup.
 */
function createExternalInboundFixture(): InboundNormalizedMessage {
  return {
    messageId: '<fixture-external-inbound@protege.local>',
    threadId: externalThreadId,
    from: [{ address: 'sender@example.com' }],
    to: [{ address: personaMailboxIdentity }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: personaMailboxIdentity }],
    subject: 'External subject',
    text: 'External message body with   extra\n whitespace for preview normalization.',
    html: undefined,
    references: [],
    receivedAt: '2026-02-19T10:00:00.000Z',
    rawMimePath: '/tmp/external-message.eml',
    attachments: [],
  };
}

/**
 * Inserts one local synthetic chat bootstrap message into storage.
 */
function insertLocalSyntheticThread(
  args: {
    db: ProtegeDatabase;
  },
): void {
  ensureThread({
    db: args.db,
    threadId: localSyntheticThreadId,
    rootMessageId: '<fixture-local-synthetic-root@protege.local>',
    nowIso: '2026-02-19T10:05:00.000Z',
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
    localSyntheticThreadId,
    'synthetic',
    '<fixture-local-synthetic-root@protege.local>',
    null,
    'user@localhost',
    JSON.stringify([personaMailboxIdentity]),
    'Local Chat 2026-02-19 10:05:00',
    'Hello from local synthetic chat seed.',
    null,
    '2026-02-19T10:05:00.000Z',
    '__synthetic__',
    JSON.stringify({ chat_local_thread: true }),
  );
}

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-chat-queries-'));
  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  storeInboundMessage({
    db: db as ProtegeDatabase,
    request: {
      message: createExternalInboundFixture(),
    },
  });
  storeOutboundMessage({
    db: db as ProtegeDatabase,
    request: {
      threadId: externalThreadId,
      messageId: '<fixture-external-outbound@protege.local>',
      inReplyTo: '<fixture-external-inbound@protege.local>',
      sender: personaMailboxIdentity,
      recipients: ['sender@example.com'],
      subject: 'Re: External subject',
      text: 'External reply.',
      receivedAt: '2026-02-19T10:01:00.000Z',
      metadata: {
        attachments: [
          {
            path: '/tmp/external-reply-attachment.txt',
          },
        ],
      },
    },
  });
  insertLocalSyntheticThread({
    db: db as ProtegeDatabase,
  });

  const summaries = listChatThreadSummaries({
    db: db as ProtegeDatabase,
    personaMailboxIdentity,
  });
  summariesThreadIds = summaries.map((summary) => summary.threadId);
  summariesReadOnlyStates = summaries.map((summary) => summary.isReadOnly);
  summariesSubjects = summaries.map((summary) => summary.subject);
  firstSummaryPreview = summaries[0]?.preview ?? '';

  const localDetail = readChatThreadDetail({
    db: db as ProtegeDatabase,
    threadId: localSyntheticThreadId,
    personaMailboxIdentity,
  });
  localThreadDetailReadOnly = localDetail.isReadOnly;
  localThreadMessageCount = localDetail.messages.length;

  const externalDetail = readChatThreadDetail({
    db: db as ProtegeDatabase,
    threadId: externalThreadId,
    personaMailboxIdentity,
  });
  externalThreadDetailReadOnly = externalDetail.isReadOnly;
  externalThreadMessageCount = externalDetail.messages.length;
  externalThreadAttachmentPath = externalDetail.messages[1]?.attachmentPaths[0] ?? '';

  const unknownDetail = readChatThreadDetail({
    db: db as ProtegeDatabase,
    threadId: 'thread-does-not-exist',
    personaMailboxIdentity,
  });
  unknownThreadMessageCount = unknownDetail.messages.length;
  unknownThreadReadOnly = unknownDetail.isReadOnly;
});

afterAll((): void => {
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('chat query thread summaries', () => {
  it('returns thread summaries in descending last-activity order', () => {
    expect(summariesThreadIds[0]).toBe(localSyntheticThreadId);
  });

  it('marks local synthetic thread as writable', () => {
    expect(summariesReadOnlyStates[0]).toBe(false);
  });

  it('marks external thread as read-only', () => {
    expect(summariesReadOnlyStates[1]).toBe(true);
  });

  it('normalizes preview whitespace in summary rows', () => {
    expect(firstSummaryPreview.includes('  ')).toBe(false);
  });

  it('keeps summary subject stable to thread root subject after later replies', () => {
    expect(summariesSubjects[1]).toBe('External subject');
  });
});

describe('chat query thread detail', () => {
  it('returns writable detail for local synthetic thread', () => {
    expect(localThreadDetailReadOnly).toBe(false);
  });

  it('returns messages for local synthetic thread detail', () => {
    expect(localThreadMessageCount).toBe(1);
  });

  it('returns read-only detail for external thread', () => {
    expect(externalThreadDetailReadOnly).toBe(true);
  });

  it('returns full message history for external thread detail', () => {
    expect(externalThreadMessageCount).toBe(2);
  });

  it('extracts attachment file paths from message metadata', () => {
    expect(externalThreadAttachmentPath).toBe('/tmp/external-reply-attachment.txt');
  });

  it('returns empty detail for unknown thread ids', () => {
    expect(unknownThreadMessageCount).toBe(0);
  });

  it('marks unknown thread ids as read-only', () => {
    expect(unknownThreadReadOnly).toBe(true);
  });
});
