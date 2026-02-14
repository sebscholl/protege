import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listThreadMessages, searchMessages, storeInboundMessage } from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';

let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let storedMessageId = '';
let threadMessagesCount = 0;
let searchResultsCount = 0;

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
});
