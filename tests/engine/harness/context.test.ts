import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildHarnessContext,
  estimateTokens,
  loadActiveMemory,
  truncateHistoryToTokenBudget,
} from '@engine/harness/context/history';
import type { HarnessContextHistoryEntry, HarnessInput } from '@engine/harness/types';
import { storeInboundMessage, storeThreadToolEvent } from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let db: ProtegeDatabase | undefined;
let activeMemoryPath = '';
let harnessContextHistoryCount = 0;
let harnessContextActiveMemory = '';
let truncatedHistoryCount = 0;
let estimatedTokenCount = 0;
let harnessContextContainsToolCall = false;
let harnessContextContainsToolResult = false;

const inboundA: InboundNormalizedMessage = {
  messageId: '<a@fixture.local>',
  threadId: 'thread-context-1',
  from: [{ address: 'alice@example.com' }],
  to: [{ address: 'protege@localhost' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'protege@localhost' }],
  subject: 'First context message',
  text: 'hello one',
  html: undefined,
  references: [],
  receivedAt: '2026-02-14T10:00:00.000Z',
  rawMimePath: '/tmp/a.eml',
  attachments: [],
};

const inboundB: InboundNormalizedMessage = {
  messageId: '<b@fixture.local>',
  threadId: 'thread-context-1',
  from: [{ address: 'alice@example.com' }],
  to: [{ address: 'protege@localhost' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'protege@localhost' }],
  subject: 'Second context message',
  text: 'hello two with extra words',
  html: undefined,
  references: ['<a@fixture.local>'],
  receivedAt: '2026-02-14T10:01:00.000Z',
  rawMimePath: '/tmp/b.eml',
  attachments: [],
};

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-harness-context-',
    chdir: false,
  });
  activeMemoryPath = join(workspace.tempRootPath, 'active.md');
  writeFileSync(activeMemoryPath, '# Active\nremember immediate objective');

  db = initializeDatabase({
    databasePath: join(workspace.tempRootPath, 'temporal.db'),
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  storeInboundMessage({ db: db as ProtegeDatabase, request: { message: inboundA } });
  storeThreadToolEvent({
    db: db as ProtegeDatabase,
    event: {
      threadId: inboundA.threadId,
      parentMessageId: inboundA.messageId,
      runId: 'run-context-1',
      stepIndex: 1,
      eventType: 'tool_call',
      toolName: 'read_file',
      toolCallId: 'call-context-1',
      payload: {
        input: {
          path: '/tmp/example.txt',
        },
      },
      createdAt: '2026-02-14T10:00:30.000Z',
    },
  });
  storeThreadToolEvent({
    db: db as ProtegeDatabase,
    event: {
      threadId: inboundA.threadId,
      parentMessageId: inboundA.messageId,
      runId: 'run-context-1',
      stepIndex: 2,
      eventType: 'tool_result',
      toolName: 'read_file',
      toolCallId: 'call-context-1',
      payload: {
        content: 'file content',
      },
      createdAt: '2026-02-14T10:00:31.000Z',
    },
  });
  storeInboundMessage({ db: db as ProtegeDatabase, request: { message: inboundB } });

  const input: HarnessInput = {
    source: 'email',
    threadId: inboundB.threadId,
    messageId: inboundB.messageId,
    sender: inboundB.from[0].address,
    recipients: inboundB.to.map((item) => item.address),
    subject: inboundB.subject,
    text: inboundB.text,
    receivedAt: inboundB.receivedAt,
    metadata: {},
  };

  const context = buildHarnessContext({
    db: db as ProtegeDatabase,
    input,
    activeMemoryPath,
    maxHistoryTokens: 100,
  });

  harnessContextHistoryCount = context.history.length;
  harnessContextActiveMemory = context.activeMemory;
  harnessContextContainsToolCall = context.history.some((entry) => entry.text.includes('Tool call (read_file)'));
  harnessContextContainsToolResult = context.history.some((entry) => entry.text.includes('Tool result (read_file)'));

  const tinyBudgetHistory: HarnessContextHistoryEntry[] = [
    {
      direction: 'inbound',
      sender: 's@example.com',
      subject: 'One',
      text: 'alpha beta gamma delta epsilon zeta eta theta iota',
      receivedAt: '2026-02-14T10:00:00.000Z',
      messageId: '<tiny-1@x>',
    },
    {
      direction: 'inbound',
      sender: 's@example.com',
      subject: 'Two',
      text: 'short',
      receivedAt: '2026-02-14T10:01:00.000Z',
      messageId: '<tiny-2@x>',
    },
  ];
  truncatedHistoryCount = truncateHistoryToTokenBudget({
    history: tinyBudgetHistory,
    maxHistoryTokens: 3,
  }).length;

  estimatedTokenCount = estimateTokens({ value: '12345678' });
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('harness context builder', () => {
  it('loads active memory text from markdown file', () => {
    expect(loadActiveMemory({ activeMemoryPath }).includes('immediate objective')).toBe(true);
  });

  it('builds context with stored thread history entries', () => {
    expect(harnessContextHistoryCount).toBe(4);
  });

  it('attaches active memory content to built context', () => {
    expect(harnessContextActiveMemory.includes('immediate objective')).toBe(true);
  });

  it('truncates history deterministically by newest-first token budget', () => {
    expect(truncatedHistoryCount).toBe(1);
  });

  it('estimates tokens from character length using fixed ratio', () => {
    expect(estimatedTokenCount).toBe(2);
  });

  it('includes persisted tool call events in context history', () => {
    expect(harnessContextContainsToolCall).toBe(true);
  });

  it('includes persisted tool result events in context history', () => {
    expect(harnessContextContainsToolResult).toBe(true);
  });
});
