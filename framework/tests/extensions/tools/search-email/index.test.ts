import type { HarnessToolExecutionContext } from '@engine/harness/tools/contract';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { storeInboundMessage, storeOutboundMessage } from '@engine/harness/storage';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

import { createSearchEmailTool } from '@extensions/tools/search-email/index';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-search-email-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });

let toolName = '';
let schemaType = '';
let allResultsCount = 0;
let ftsResultsCount = 0;
let ftsResultSubject = '';
let fromFilterCount = 0;
let toFilterCount = 0;
let subjectFilterCount = 0;
let directionFilterCount = 0;
let afterFilterCount = 0;
let beforeFilterCount = 0;
let dateRangeCount = 0;
let limitResultsCount = 0;
let emptyResultsCount = 0;
let firstResultHasId = false;
let firstResultHasThreadId = false;
let firstResultHasDirection = false;
let firstResultHasMessageId = false;
let firstResultHasSender = false;
let firstResultHasRecipients = false;
let firstResultHasSubject = false;
let firstResultHasReceivedAt = false;
let firstResultHasTextBody = false;
let firstResultHasMetadata = false;
let noFiltersErrorMessage = '';
let ftsInjectionResultCount = -1;

beforeAll(async (): Promise<void> => {
  storeInboundMessage({
    db: testDb,
    request: {
      message: {
        messageId: '<msg-1@example.com>',
        threadId: 'thread-1',
        from: [{ address: 'alice@example.com' }],
        to: [{ address: 'protege@localhost' }],
        cc: [],
        bcc: [],
        envelopeRcptTo: [{ address: 'protege@localhost' }],
        subject: 'Weekly standup notes',
        text: 'We discussed the deployment pipeline and agreed on Friday releases.',
        html: undefined,
        references: [],
        receivedAt: '2026-04-01T10:00:00.000Z',
        rawMimePath: '/tmp/msg-1.eml',
        attachments: [],
      },
    },
  });

  storeInboundMessage({
    db: testDb,
    request: {
      message: {
        messageId: '<msg-2@example.com>',
        threadId: 'thread-2',
        from: [{ address: 'bob@example.com' }],
        to: [{ address: 'protege@localhost' }],
        cc: [],
        bcc: [],
        envelopeRcptTo: [{ address: 'protege@localhost' }],
        subject: 'Budget review Q1',
        text: 'The quarterly budget numbers are attached. Please review the marketing spend.',
        html: undefined,
        references: [],
        receivedAt: '2026-04-03T14:00:00.000Z',
        rawMimePath: '/tmp/msg-2.eml',
        attachments: [],
      },
    },
  });

  storeInboundMessage({
    db: testDb,
    request: {
      message: {
        messageId: '<msg-3@example.com>',
        threadId: 'thread-3',
        from: [{ address: 'alice@example.com' }],
        to: [{ address: 'protege@localhost' }],
        cc: [],
        bcc: [],
        envelopeRcptTo: [{ address: 'protege@localhost' }],
        subject: 'Gemini meeting transcript',
        text: 'Full transcript of the product sync meeting with action items and decisions.',
        html: undefined,
        references: [],
        receivedAt: '2026-04-05T18:00:00.000Z',
        rawMimePath: '/tmp/msg-3.eml',
        attachments: [],
      },
    },
  });

  storeOutboundMessage({
    db: testDb,
    request: {
      threadId: 'thread-1',
      messageId: '<msg-4@protege.local>',
      inReplyTo: '<msg-1@example.com>',
      sender: 'protege@localhost',
      recipients: ['alice@example.com'],
      subject: 'Re: Weekly standup notes',
      text: 'Acknowledged. Friday releases confirmed.',
      receivedAt: '2026-04-01T10:05:00.000Z',
      metadata: {},
    },
  });

  const tool = createSearchEmailTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const ctx: HarnessToolExecutionContext = {
    runtime: {
      invoke: async (): Promise<Record<string, unknown>> => ({}),
    },
    logger: workspace.logger,
    db: testDb,
  };

  const allResults = await tool.execute({ input: { after: '2000-01-01T00:00:00.000Z' }, context: ctx });
  const allItems = allResults.messages as Array<Record<string, unknown>>;
  allResultsCount = allItems.length;

  if (allItems.length > 0) {
    const first = allItems[0];
    firstResultHasId = typeof first.id === 'string' && first.id.length > 0;
    firstResultHasThreadId = typeof first.threadId === 'string' && first.threadId.length > 0;
    firstResultHasDirection = typeof first.direction === 'string' && first.direction.length > 0;
    firstResultHasMessageId = typeof first.messageId === 'string' && first.messageId.length > 0;
    firstResultHasSender = typeof first.sender === 'string' && first.sender.length > 0;
    firstResultHasRecipients = typeof first.recipients === 'string' && first.recipients.length > 0;
    firstResultHasSubject = typeof first.subject === 'string' && first.subject.length > 0;
    firstResultHasReceivedAt = typeof first.receivedAt === 'string' && first.receivedAt.length > 0;
    firstResultHasTextBody = typeof first.textBody === 'string' && (first.textBody as string).length > 0;
    firstResultHasMetadata = typeof first.metadata === 'object' && first.metadata !== null;
  }

  const ftsResults = await tool.execute({ input: { query: 'deployment pipeline' }, context: ctx });
  const ftsItems = ftsResults.messages as Array<Record<string, unknown>>;
  ftsResultsCount = ftsItems.length;
  ftsResultSubject = ftsItems.length > 0 ? String(ftsItems[0].subject ?? '') : '';

  const fromResults = await tool.execute({ input: { from: 'alice@example.com' }, context: ctx });
  fromFilterCount = (fromResults.messages as unknown[]).length;

  const toResults = await tool.execute({ input: { to: 'alice@example.com' }, context: ctx });
  toFilterCount = (toResults.messages as unknown[]).length;

  const subjectResults = await tool.execute({ input: { subject: 'budget' }, context: ctx });
  subjectFilterCount = (subjectResults.messages as unknown[]).length;

  const directionResults = await tool.execute({ input: { direction: 'outbound' }, context: ctx });
  directionFilterCount = (directionResults.messages as unknown[]).length;

  const afterResults = await tool.execute({ input: { after: '2026-04-04T00:00:00.000Z' }, context: ctx });
  afterFilterCount = (afterResults.messages as unknown[]).length;

  const beforeResults = await tool.execute({ input: { before: '2026-04-02T00:00:00.000Z' }, context: ctx });
  beforeFilterCount = (beforeResults.messages as unknown[]).length;

  const rangeResults = await tool.execute({ input: { after: '2026-04-02T00:00:00.000Z', before: '2026-04-04T00:00:00.000Z' }, context: ctx });
  dateRangeCount = (rangeResults.messages as unknown[]).length;

  const limitResults = await tool.execute({ input: { after: '2000-01-01T00:00:00.000Z', limit: 2 }, context: ctx });
  limitResultsCount = (limitResults.messages as unknown[]).length;

  const emptyResults = await tool.execute({ input: { query: 'xyznonexistentkeyword' }, context: ctx });
  emptyResultsCount = (emptyResults.messages as unknown[]).length;

  try {
    await tool.execute({ input: {}, context: ctx });
  } catch (error) {
    noFiltersErrorMessage = (error as Error).message;
  }

  const injectionResults = await tool.execute({ input: { query: 'OR 1=1 --' }, context: ctx });
  ftsInjectionResultCount = (injectionResults.messages as unknown[]).length;
});

afterAll((): void => { workspace.cleanup(); });

describe('search-email tool extension', () => {
  it('declares search_email as the stable tool name', () => {
    expect(toolName).toBe('search_email');
  });

  it('declares object input schema for provider tool exposure', () => {
    expect(schemaType).toBe('object');
  });

  it('returns all messages for a broad date filter', () => {
    expect(allResultsCount).toBe(4);
  });

  it('returns matching messages for a full-text search query', () => {
    expect(ftsResultsCount).toBe(1);
  });

  it('returns the correct subject for a full-text search match', () => {
    expect(ftsResultSubject).toBe('Weekly standup notes');
  });

  it('filters messages by sender address', () => {
    expect(fromFilterCount).toBe(2);
  });

  it('filters messages by recipient address', () => {
    expect(toFilterCount).toBe(1);
  });

  it('filters messages by subject substring', () => {
    expect(subjectFilterCount).toBe(1);
  });

  it('filters messages by direction', () => {
    expect(directionFilterCount).toBe(1);
  });

  it('filters messages after a given date', () => {
    expect(afterFilterCount).toBe(1);
  });

  it('filters messages before a given date', () => {
    expect(beforeFilterCount).toBe(2);
  });

  it('filters messages within a date range', () => {
    expect(dateRangeCount).toBe(1);
  });

  it('respects the limit parameter', () => {
    expect(limitResultsCount).toBe(2);
  });

  it('returns empty array when no messages match', () => {
    expect(emptyResultsCount).toBe(0);
  });

  it('includes id in result shape', () => {
    expect(firstResultHasId).toBe(true);
  });

  it('includes threadId in result shape', () => {
    expect(firstResultHasThreadId).toBe(true);
  });

  it('includes direction in result shape', () => {
    expect(firstResultHasDirection).toBe(true);
  });

  it('includes messageId in result shape', () => {
    expect(firstResultHasMessageId).toBe(true);
  });

  it('includes sender in result shape', () => {
    expect(firstResultHasSender).toBe(true);
  });

  it('includes recipients in result shape', () => {
    expect(firstResultHasRecipients).toBe(true);
  });

  it('includes subject in result shape', () => {
    expect(firstResultHasSubject).toBe(true);
  });

  it('includes receivedAt in result shape', () => {
    expect(firstResultHasReceivedAt).toBe(true);
  });

  it('includes full textBody in result shape', () => {
    expect(firstResultHasTextBody).toBe(true);
  });

  it('includes parsed metadata in result shape', () => {
    expect(firstResultHasMetadata).toBe(true);
  });

  it('raises an error when no filters are provided', () => {
    expect(noFiltersErrorMessage.length > 0).toBe(true);
  });

  it('sanitizes fts injection attempts without errors', () => {
    expect(ftsInjectionResultCount).toBe(0);
  });
});
