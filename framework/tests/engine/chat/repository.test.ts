import type { ProtegeDatabase } from '@engine/shared/database';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  insertLocalSyntheticSeedMessage,
  insertLocalSyntheticUserMessage,
  listThreadActivityRows,
  listThreadMessageRows,
  readFirstThreadMessageMetadataRow,
  readLastThreadMessageId,
  readLastThreadMessagePreviewRow,
  readThreadRootSubjectByRootMessage,
  readThreadSubject,
} from '@engine/chat/repository';
import { ensureThread } from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let db: ProtegeDatabase | undefined;
let activityRowCount = 0;
let firstActivityThreadId = '';
let threadMessageRowCount = 0;
let firstMessageDirection = '';
let firstMessageSender = '';
let lastPreviewText = '';
let rootSubject = '';
let lastMessageId = '';
let canonicalSubject = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-chat-repository-',
    chdir: false,
  });
  db = initializeDatabase({
    databasePath: join(workspace.tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  const threadId = 'thread-chat-repository';
  const rootMessageId = '<chat.seed@localhost>';
  ensureThread({
    db: db as ProtegeDatabase,
    threadId,
    rootMessageId,
    nowIso: '2026-03-06T10:00:00.000Z',
  });
  insertLocalSyntheticSeedMessage({
    db: db as ProtegeDatabase,
    threadId,
    messageId: rootMessageId,
    personaMailboxIdentity: 'persona@localhost',
    subject: 'Local Chat 2026-03-06 10:00:00',
    receivedAt: '2026-03-06T10:00:00.000Z',
  });
  insertLocalSyntheticUserMessage({
    db: db as ProtegeDatabase,
    threadId,
    messageId: '<chat.message@localhost>',
    inReplyTo: rootMessageId,
    personaMailboxIdentity: 'persona@localhost',
    subject: 'Local Chat 2026-03-06 10:00:00',
    text: 'hello from repository test',
    receivedAt: '2026-03-06T10:00:10.000Z',
  });

  const activityRows = listThreadActivityRows({
    db: db as ProtegeDatabase,
    limit: 20,
  });
  activityRowCount = activityRows.length;
  firstActivityThreadId = activityRows[0]?.threadId ?? '';

  const threadRows = listThreadMessageRows({
    db: db as ProtegeDatabase,
    threadId,
  });
  threadMessageRowCount = threadRows.length;
  firstMessageDirection = String(threadRows[0]?.direction ?? '');
  firstMessageSender = String(threadRows[0]?.sender ?? '');

  const previewRow = readLastThreadMessagePreviewRow({
    db: db as ProtegeDatabase,
    threadId,
  });
  lastPreviewText = String(previewRow?.text_body ?? '');

  const firstMetadataRow = readFirstThreadMessageMetadataRow({
    db: db as ProtegeDatabase,
    threadId,
  });
  firstMessageDirection = String(firstMetadataRow?.direction ?? '');
  firstMessageSender = String(firstMetadataRow?.sender ?? '');

  rootSubject = readThreadRootSubjectByRootMessage({
    db: db as ProtegeDatabase,
    threadId,
  }) ?? '';
  lastMessageId = readLastThreadMessageId({
    db: db as ProtegeDatabase,
    threadId,
  }) ?? '';
  canonicalSubject = readThreadSubject({
    db: db as ProtegeDatabase,
    threadId,
  });
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('chat repository sql access', () => {
  it('lists thread activity rows', () => {
    expect(activityRowCount > 0).toBe(true);
  });

  it('returns activity rows keyed by thread id', () => {
    expect(firstActivityThreadId).toBe('thread-chat-repository');
  });

  it('lists chronological thread message rows', () => {
    expect(threadMessageRowCount).toBe(2);
  });

  it('returns first message metadata row for thread classification', () => {
    expect(firstMessageDirection === 'synthetic' && firstMessageSender === 'user@localhost').toBe(true);
  });

  it('returns latest message preview row for inbox rendering', () => {
    expect(lastPreviewText).toBe('hello from repository test');
  });

  it('returns canonical thread root subject from thread linkage', () => {
    expect(rootSubject).toBe('Local Chat 2026-03-06 10:00:00');
  });

  it('returns last message id for synthetic thread append operations', () => {
    expect(lastMessageId).toBe('<chat.message@localhost>');
  });

  it('returns first-message subject as canonical thread subject fallback', () => {
    expect(canonicalSubject).toBe('Local Chat 2026-03-06 10:00:00');
  });
});
