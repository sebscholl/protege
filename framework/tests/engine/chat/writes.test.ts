import type { ProtegeDatabase } from '@engine/shared/database';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLocalChatThreadSeed, storeLocalChatUserMessage } from '@engine/chat/writes';
import { initializeDatabase } from '@engine/shared/database';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let db: ProtegeDatabase | undefined;
let seedThreadId = '';
let seedSubject = '';
let seedMessageId = '';
let seedDirection = '';
let seedRecipient = '';
let seedMetadataFlag = false;
let userMessageInReplyTo = '';
let userMessageSubject = '';
let userMessageText = '';
let userMessageDirection = '';
let threadMessageCount = 0;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-chat-writes-',
    chdir: false,
  });
  db = initializeDatabase({
    databasePath: join(workspace.tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  const seed = createLocalChatThreadSeed({
    db: db as ProtegeDatabase,
    personaMailboxIdentity: 'persona@localhost',
    now: new Date('2026-02-19T12:00:00.000Z'),
  });
  seedThreadId = seed.threadId;
  seedSubject = seed.subject;
  seedMessageId = seed.messageId;

  const seedRow = (db as ProtegeDatabase).prepare(`
    SELECT direction, recipients, metadata_json
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at ASC
    LIMIT 1
  `).get(seedThreadId) as {
    direction: string;
    recipients: string;
    metadata_json: string;
  };
  seedDirection = seedRow.direction;
  seedRecipient = (JSON.parse(seedRow.recipients) as string[])[0] ?? '';
  seedMetadataFlag = (JSON.parse(seedRow.metadata_json) as { chat_local_thread?: boolean }).chat_local_thread === true;

  const userMessage = storeLocalChatUserMessage({
    db: db as ProtegeDatabase,
    threadId: seedThreadId,
    personaMailboxIdentity: 'persona@localhost',
    text: 'hello from user',
    now: new Date('2026-02-19T12:00:05.000Z'),
  });
  userMessageInReplyTo = userMessage.inReplyTo ?? '';
  userMessageSubject = userMessage.subject;
  userMessageText = userMessage.text;

  const userRow = (db as ProtegeDatabase).prepare(`
    SELECT direction
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get(seedThreadId) as {
    direction: string;
  };
  userMessageDirection = userRow.direction;
  threadMessageCount = ((db as ProtegeDatabase).prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    WHERE thread_id = ?
  `).get(seedThreadId) as { count: number }).count;
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('chat local thread seed writes', () => {
  it('creates a deterministic local chat subject prefix', () => {
    expect(seedSubject.startsWith('Local Chat ')).toBe(true);
  });

  it('creates a synthetic seed message id', () => {
    expect(seedMessageId.includes('@localhost>')).toBe(true);
  });

  it('stores synthetic direction for seed messages', () => {
    expect(seedDirection).toBe('synthetic');
  });

  it('stores persona mailbox recipient in seed message recipients', () => {
    expect(seedRecipient).toBe('persona@localhost');
  });

  it('stores local thread metadata flag on seed message', () => {
    expect(seedMetadataFlag).toBe(true);
  });
});

describe('chat local user message writes', () => {
  it('threads local user message to previous seed message id', () => {
    expect(userMessageInReplyTo).toBe(seedMessageId);
  });

  it('reuses root local thread subject for user messages', () => {
    expect(userMessageSubject).toBe(seedSubject);
  });

  it('stores user message text payload', () => {
    expect(userMessageText).toBe('hello from user');
  });

  it('stores synthetic direction for user messages', () => {
    expect(userMessageDirection).toBe('synthetic');
  });

  it('persists both seed and user messages in thread history', () => {
    expect(threadMessageCount).toBe(2);
  });
});
