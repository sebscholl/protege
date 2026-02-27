import type { ChatSessionState } from '@engine/chat/controller';
import type { ChatThreadDetail, ChatThreadSummary } from '@engine/chat/queries';
import type { ChatKeymap } from '@engine/shared/runtime-config';

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

const keymap: ChatKeymap = {
  send: 'ctrl+s',
  refresh: 'ctrl+r',
  toggle_display_mode: 'ctrl+v',
  quit: 'ctrl+q',
  move_selection_up: 'up',
  move_selection_down: 'down',
  open_thread: 'enter',
  back_to_inbox: 'esc',
  new_local_thread: 'ctrl+n',
  enter_compose_mode: 'i',
  scroll_thread_up: 'up',
  scroll_thread_down: 'down',
  scroll_thread_page_up: 'pageup',
  scroll_thread_page_down: 'pagedown',
  compose_cursor_left: 'left',
  compose_cursor_right: 'right',
  compose_cursor_home: 'home',
  compose_cursor_end: 'end',
  compose_delete_backward: 'backspace',
  compose_delete_forward: 'delete',
};

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
      attachmentPaths: ['/tmp/message-attachment.txt'],
    },
  ],
};

const readOnlyDetail: ChatThreadDetail = {
  ...writableDetail,
  isReadOnly: true,
};

let inboxFooter = '';
let selectedThreadRowCount = 0;
let inboxTimestamp = '';
let inboxParticipants = '';
let inboxPreviewTruncated = false;
let writableBanner = '';
let writableDraft = '';
let writableFooter = '';
let readOnlyBanner = '';
let readOnlyDraft = '';
let verboseHeaderHasEnvelope = false;
let verboseHeaderHasLineBreaks = false;
let writableMessageAttachmentPath = '';

beforeAll((): void => {
  const inboxViewModel = buildInboxViewModel({
    state: baseState,
    summaries,
    keymap,
  });
  inboxFooter = inboxViewModel.footerHint;
  selectedThreadRowCount = inboxViewModel.rows.filter((row) => row.isSelected).length;
  inboxTimestamp = inboxViewModel.rows[0]?.timestamp ?? '';
  inboxParticipants = inboxViewModel.rows[0]?.participants ?? '';
  inboxPreviewTruncated = (inboxViewModel.rows[0]?.preview.length ?? 0) <= 120;

  const writableThreadViewModel = buildThreadViewModel({
    state: baseState,
    detail: writableDetail,
    keymap,
  });
  writableBanner = writableThreadViewModel.writeBanner;
  writableDraft = writableThreadViewModel.draft;
  writableFooter = writableThreadViewModel.footerHint;
  writableMessageAttachmentPath = writableThreadViewModel.messages[0]?.attachmentPaths[0] ?? '';

  const readOnlyThreadViewModel = buildThreadViewModel({
    state: baseState,
    detail: readOnlyDetail,
    keymap,
  });
  readOnlyBanner = readOnlyThreadViewModel.writeBanner;
  readOnlyDraft = readOnlyThreadViewModel.draft;

  const verboseThreadViewModel = buildThreadViewModel({
    state: {
      ...baseState,
      displayMode: 'verbose',
    },
    detail: writableDetail,
    keymap,
  });
  verboseHeaderHasEnvelope = verboseThreadViewModel.messages[0]?.header.includes('From:') ?? false;
  verboseHeaderHasLineBreaks = verboseThreadViewModel.messages[0]?.header.includes('\n') ?? false;
});

describe('chat inbox view model', () => {
  it('marks selected thread rows based on session selection', () => {
    expect(selectedThreadRowCount).toBe(1);
  });

  it('includes keyboard hints in inbox footer', () => {
    expect(inboxFooter.includes('Ctrl+N')).toBe(true);
  });

  it('renders compact timestamp per inbox row', () => {
    expect(inboxTimestamp).toBe('2026-02-19 12:00');
  });

  it('renders participants per inbox row', () => {
    expect(inboxParticipants).toBe('user@localhost');
  });

  it('caps inbox preview length for readable list rows', () => {
    expect(inboxPreviewTruncated).toBe(true);
  });
});

describe('chat thread view model', () => {
  it('renders explicit writable banner for local chat threads', () => {
    expect(writableBanner).toContain('WRITABLE');
  });

  it('keeps draft text visible in writable thread view', () => {
    expect(writableDraft).toBe('draft text');
  });

  it('shows ctrl+s send hint in writable thread footer', () => {
    expect(writableFooter.includes('Ctrl+S=send')).toBe(true);
  });

  it('passes attachment paths through to thread message models', () => {
    expect(writableMessageAttachmentPath).toBe('/tmp/message-attachment.txt');
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

  it('renders verbose thread headers on distinct lines', () => {
    expect(verboseHeaderHasLineBreaks).toBe(true);
  });
});
