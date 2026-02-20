import type { ChatSessionState } from '@engine/chat/controller';
import type { ChatThreadDetail, ChatThreadSummary } from '@engine/chat/queries';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildInboxViewModel, buildThreadViewModel } from '@engine/chat/view-model';

const baseState: ChatSessionState = {
  view: 'thread',
  mode: 'compose',
  displayMode: 'light',
  selectedThreadId: 'thread-local',
  isCurrentThreadReadOnly: false,
  draft: 'draft text',
  shouldQuit: false,
};

const summaries: ChatThreadSummary[] = [
  {
    threadId: 'thread-local',
    subject: 'Local Chat 2026-02-19 12:00:00',
    lastSender: 'user@localhost',
    lastReceivedAt: '2026-02-19T12:00:00.000Z',
    preview: 'hello world',
    messageCount: 2,
    isReadOnly: false,
  },
];

const writableDetail: ChatThreadDetail = {
  threadId: 'thread-local',
  subject: 'Local Chat 2026-02-19 12:00:00',
  isReadOnly: false,
  messages: [
    {
      id: 'm-1',
      threadId: 'thread-local',
      direction: 'synthetic',
      messageId: '<m-1@localhost>',
      sender: 'user@localhost',
      recipients: ['persona@localhost'],
      subject: 'Local Chat',
      textBody: 'hello',
      receivedAt: '2026-02-19T12:00:00.000Z',
      metadata: {},
    },
  ],
};

const readOnlyDetail: ChatThreadDetail = {
  ...writableDetail,
  isReadOnly: true,
};

let inboxFooter = '';
let selectedThreadRowCount = 0;
let writableBanner = '';
let writableDraft = '';
let readOnlyBanner = '';
let readOnlyDraft = '';
let verboseHeaderHasEnvelope = false;

beforeAll((): void => {
  const inboxViewModel = buildInboxViewModel({
    state: baseState,
    summaries,
  });
  inboxFooter = inboxViewModel.footerHint;
  selectedThreadRowCount = inboxViewModel.rows.filter((row) => row.isSelected).length;

  const writableThreadViewModel = buildThreadViewModel({
    state: baseState,
    detail: writableDetail,
  });
  writableBanner = writableThreadViewModel.writeBanner;
  writableDraft = writableThreadViewModel.draft;

  const readOnlyThreadViewModel = buildThreadViewModel({
    state: baseState,
    detail: readOnlyDetail,
  });
  readOnlyBanner = readOnlyThreadViewModel.writeBanner;
  readOnlyDraft = readOnlyThreadViewModel.draft;

  const verboseThreadViewModel = buildThreadViewModel({
    state: {
      ...baseState,
      displayMode: 'verbose',
    },
    detail: writableDetail,
  });
  verboseHeaderHasEnvelope = verboseThreadViewModel.messages[0]?.header.includes('From:') ?? false;
});

describe('chat inbox view model', () => {
  it('marks selected thread rows based on session selection', () => {
    expect(selectedThreadRowCount).toBe(1);
  });

  it('includes keyboard hints in inbox footer', () => {
    expect(inboxFooter.includes('Ctrl+N')).toBe(true);
  });
});

describe('chat thread view model', () => {
  it('renders explicit writable banner for local chat threads', () => {
    expect(writableBanner).toContain('WRITABLE');
  });

  it('keeps draft text visible in writable thread view', () => {
    expect(writableDraft).toBe('draft text');
  });

  it('renders explicit read-only banner for locked threads', () => {
    expect(readOnlyBanner).toContain('READ-ONLY');
  });

  it('hides draft text in read-only thread view', () => {
    expect(readOnlyDraft).toBe('');
  });

  it('renders envelope metadata in verbose thread mode', () => {
    expect(verboseHeaderHasEnvelope).toBe(true);
  });
});
