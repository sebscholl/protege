import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  listThreadToolEventsByThread,
  listThreadMessages,
  searchMessages,
  storeInboundMessage,
  storeOutboundMessage,
  storeThreadToolEvent,
} from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let storedMessageId = '';
let threadMessagesCount = 0;
let searchResultsCount = 0;
let outboundDirection = '';
let threadToolEventsCount = 0;
let firstThreadToolEventType = '';
let secondThreadToolEventType = '';

const inboundFixture: InboundNormalizedMessage = {
  messageId: '<fixture-inbound@protege.local>',
  threadId: 'thread-123',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'protege@localhost' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'protege@localhost' }],
  subject: 'Storage fixture subject',
  text: 'Storage fixture body with uniquekeyword',
  html: undefined,
  references: [],
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/example.eml',
  attachments: [],
};

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-harness-storage-'));
  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  const stored = storeInboundMessage({
    db: db as ProtegeDatabase,
    request: {
      message: inboundFixture,
    },
  });
  storedMessageId = stored.id;

  threadMessagesCount = listThreadMessages({
    db: db as ProtegeDatabase,
    threadId: inboundFixture.threadId,
  }).length;

  searchResultsCount = searchMessages({
    db: db as ProtegeDatabase,
    query: 'uniquekeyword',
  }).length;

  storeOutboundMessage({
    db: db as ProtegeDatabase,
    request: {
      threadId: inboundFixture.threadId,
      messageId: '<fixture-outbound@protege.local>',
      inReplyTo: inboundFixture.messageId,
      sender: 'protege@localhost',
      recipients: ['sender@example.com'],
      subject: 'Re: Storage fixture subject',
      text: 'Outbound response',
      receivedAt: '2026-02-14T00:00:10.000Z',
      metadata: {},
    },
  });
  outboundDirection = listThreadMessages({
    db: db as ProtegeDatabase,
    threadId: inboundFixture.threadId,
  })[1]?.direction ?? '';

  storeThreadToolEvent({
    db: db as ProtegeDatabase,
    event: {
      threadId: inboundFixture.threadId,
      parentMessageId: inboundFixture.messageId,
      runId: 'run-1',
      stepIndex: 1,
      eventType: 'tool_call',
      toolName: 'read_file',
      toolCallId: 'call-1',
      payload: {
        input: {
          path: '/tmp/a.txt',
        },
      },
      createdAt: '2026-02-14T00:00:05.000Z',
    },
  });
  storeThreadToolEvent({
    db: db as ProtegeDatabase,
    event: {
      threadId: inboundFixture.threadId,
      parentMessageId: inboundFixture.messageId,
      runId: 'run-1',
      stepIndex: 2,
      eventType: 'tool_result',
      toolName: 'read_file',
      toolCallId: 'call-1',
      payload: {
        content: 'hello',
      },
      createdAt: '2026-02-14T00:00:06.000Z',
    },
  });

  const threadToolEvents = listThreadToolEventsByThread({
    db: db as ProtegeDatabase,
    threadId: inboundFixture.threadId,
  });
  threadToolEventsCount = threadToolEvents.length;
  firstThreadToolEventType = threadToolEvents[0]?.eventType ?? '';
  secondThreadToolEventType = threadToolEvents[1]?.eventType ?? '';
});

afterAll((): void => {
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness storage persistence', () => {
  it('stores inbound messages and returns a generated persistence id', () => {
    expect(storedMessageId.length > 10).toBe(true);
  });

  it('returns persisted messages for a thread history lookup', () => {
    expect(threadMessagesCount).toBe(1);
  });

  it('returns results from fts search over stored messages', () => {
    expect(searchResultsCount).toBe(1);
  });

  it('stores outbound messages with outbound direction', () => {
    expect(outboundDirection).toBe('outbound');
  });

  it('stores thread tool events linked to a thread timeline', () => {
    expect(threadToolEventsCount).toBe(2);
  });

  it('returns thread tool events ordered by causal sequence', () => {
    expect(firstThreadToolEventType === 'tool_call' && secondThreadToolEventType === 'tool_result').toBe(true);
  });
});
