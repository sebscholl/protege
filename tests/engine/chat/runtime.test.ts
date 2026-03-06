import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { readFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyHorizontalPadding,
  buildStatusLine,
  computeNextInboxTopRowIndex,
  createChatRuntimeActionInvoker,
  formatInboxListRow,
  parseStatusHintCommands,
  readVisibleInboxRowCount,
  renderInboxRows,
  renderThreadViewContent,
  resolvePersonaBySelector,
  scrollThreadBoxToBottom,
  resolveThreadScrollDelta,
  toChatErrorStackPreview,
} from '@engine/chat/runtime';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { createPersona } from '@engine/shared/personas';
import { initializeDatabase } from '@engine/shared/database';
import { getDefaultChatKeymap, getDefaultChatUiTheme } from '@engine/shared/runtime-config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let originalCwd = '';
let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let resolvedPersonaId = '';
let outboundCount = 0;
let outboundSender = '';
let unsupportedActionError = '';
let fileReadContent = '';
let fileWriteContent = '';
let fileEditContent = '';
let createdPersonaId = '';
let statusLine = '';
let statusLineWithoutMessage = '';
let scrollUpDelta = 0;
let scrollPageDownDelta = 0;
let scrollUnknownDelta: number | undefined;
let capturedScrollPercent = -1;
let paddedContent = '';
let formattedInboxRow = '';
let renderedInboxRows = '';
let topRowMovesUpToSelection = -1;
let topRowMovesDownToKeepVisible = -1;
let topRowUnchangedWhenVisible = -1;
let visibleInboxRowCount = 0;
let parsedStatusHintCommandsCount = 0;
let renderedThreadContent = '';
let chatErrorStackPreviewLength = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

const inboundMessage: InboundNormalizedMessage = createInboundMessage({
  personaId: 'persona-test',
  messageId: '<message-1@localhost>',
  threadId: 'thread-1',
  subject: 'Local Chat',
  text: 'hello',
  from: ['user@localhost'],
  to: ['persona@localhost'],
  envelopeRcptTo: ['persona@localhost'],
  receivedAt: '2026-02-19T10:00:00.000Z',
  rawMimePath: '__chat__',
});

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-chat-runtime-',
  });
  originalCwd = workspace.previousCwd;
  tempRootPath = workspace.tempRootPath;

  const created = createPersona({});
  createdPersonaId = created.personaId;
  const persona = resolvePersonaBySelector({
    selector: created.personaId.slice(0, 6),
  });
  resolvedPersonaId = persona.personaId;

  db = initializeDatabase({
    databasePath: join(tempRootPath, 'memory', 'persona-test', 'temporal.db'),
    migrationsDirPath: join(originalCwd, 'engine', 'shared', 'migrations'),
  });
  const invoke = createChatRuntimeActionInvoker({
    db: db as ProtegeDatabase,
    message: inboundMessage,
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    personaMailboxIdentity: 'persona@localhost',
  });

  await invoke({
    action: 'email.send',
    payload: {
      to: ['user@localhost'],
      subject: 'Re: Local Chat',
      text: 'response',
    },
  });
  const countRow = (db as ProtegeDatabase).prepare(`
    SELECT COUNT(*) AS count
    FROM messages
    WHERE thread_id = ?
  `).get('thread-1') as {
    count: number;
  };
  outboundCount = countRow.count;
  const senderRow = (db as ProtegeDatabase).prepare(`
    SELECT sender
    FROM messages
    WHERE thread_id = ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get('thread-1') as {
    sender: string;
  };
  outboundSender = senderRow.sender;

  try {
    await invoke({
      action: 'tool.unsupported',
      payload: {},
    });
  } catch (error) {
    unsupportedActionError = (error as Error).message;
  }

  workspace.writeFile({
    relativePath: 'tmp/chat-read.txt',
    payload: 'chat-read',
  });
  const fileReadResult = await invoke({
    action: 'file.read',
    payload: {
      path: 'tmp/chat-read.txt',
    },
  });
  fileReadContent = String(fileReadResult.content ?? '');

  await invoke({
    action: 'file.write',
    payload: {
      path: 'tmp/chat-write.txt',
      content: 'chat-write',
    },
  });
  fileWriteContent = readFileSync(join(tempRootPath, 'tmp', 'chat-write.txt'), 'utf8');

  workspace.writeFile({
    relativePath: 'tmp/chat-edit.txt',
    payload: 'before after before',
  });
  await invoke({
    action: 'file.edit',
    payload: {
      path: 'tmp/chat-edit.txt',
      oldText: 'before',
      newText: 'after',
      replaceAll: true,
    },
  });
  fileEditContent = readFileSync(join(tempRootPath, 'tmp', 'chat-edit.txt'), 'utf8');

  statusLine = buildStatusLine({
    view: 'thread',
    displayModeLabel: 'LIGHT',
    footerHint: 'Ctrl+S=send  Ctrl+R=refresh',
    statusMessage: 'Sending...',
    theme: getDefaultChatUiTheme(),
  });
  statusLineWithoutMessage = buildStatusLine({
    view: 'inbox',
    displayModeLabel: 'LIGHT',
    footerHint: 'Enter=open thread  Ctrl+Q=quit',
    statusMessage: '',
    theme: getDefaultChatUiTheme(),
  });
  parsedStatusHintCommandsCount = parseStatusHintCommands({
    footerHint: 'Enter=open thread  Ctrl+N=new local thread  Ctrl+Q=quit',
  }).length;
  scrollUpDelta = resolveThreadScrollDelta({
    binding: 'up',
    keymap: getDefaultChatKeymap(),
  }) ?? 0;
  scrollPageDownDelta = resolveThreadScrollDelta({
    binding: 'pagedown',
    keymap: getDefaultChatKeymap(),
  }) ?? 0;
  scrollUnknownDelta = resolveThreadScrollDelta({
    binding: 'x',
    keymap: getDefaultChatKeymap(),
  });
  scrollThreadBoxToBottom({
    threadBox: {
      setScrollPerc: (
        percent: number,
      ): void => {
        capturedScrollPercent = percent;
      },
    },
  });
  paddedContent = applyHorizontalPadding({
    content: 'line-one\nline-two',
  });
  formattedInboxRow = formatInboxListRow({
    title: 'Inbox Subject',
    timestamp: '2026-02-27 21:30',
    participants: 'user@localhost, persona@localhost',
    preview: 'This is one preview line.',
    isReadOnly: false,
    theme: getDefaultChatUiTheme(),
  });
  renderedInboxRows = renderInboxRows({
    rows: [
      {
        title: 'Subject A',
        timestamp: '2026-02-27 21:30',
        participants: 'user@localhost',
        preview: 'preview a',
        isReadOnly: false,
      },
      {
        title: 'Subject B',
        timestamp: '2026-02-27 21:31',
        participants: 'persona@localhost',
        preview: 'preview b',
        isReadOnly: true,
      },
    ],
    selectedIndex: 1,
    theme: getDefaultChatUiTheme(),
  });
  topRowMovesUpToSelection = computeNextInboxTopRowIndex({
    currentTopRowIndex: 2,
    selectedIndex: 0,
    visibleRowCount: 2,
  });
  topRowMovesDownToKeepVisible = computeNextInboxTopRowIndex({
    currentTopRowIndex: 0,
    selectedIndex: 3,
    visibleRowCount: 2,
  });
  topRowUnchangedWhenVisible = computeNextInboxTopRowIndex({
    currentTopRowIndex: 1,
    selectedIndex: 1,
    visibleRowCount: 2,
  });
  visibleInboxRowCount = readVisibleInboxRowCount({
    rowHeightLines: 4,
    inboxList: {
      height: 10,
    },
  });
  renderedThreadContent = renderThreadViewContent({
    title: 'Thread Subject',
    modeLabel: 'LIGHT',
    interactionMode: 'COMPOSE',
    writeBanner: 'WRITABLE LOCAL CHAT THREAD',
    messages: [
      {
        header: 'From: user@localhost\nTo: persona@localhost',
        body: 'Body one',
        attachmentPaths: ['/tmp/a.txt'],
      },
      {
        header: 'From: persona@localhost\nTo: user@localhost',
        body: 'Body two',
        attachmentPaths: [],
      },
    ],
    theme: getDefaultChatUiTheme(),
  });
  chatErrorStackPreviewLength = toChatErrorStackPreview({
    stack: 'Error: boom\n    at first\n    at second\n    at third',
  }).length;
});

afterAll((): void => {
  workspace.cleanup();
  chdir(originalCwd);
  db?.close();
});

describe('chat runtime helper behavior', () => {
  it('resolves persona selectors by prefix', () => {
    expect(resolvedPersonaId).toBe(createdPersonaId);
  });

  it('persists outbound messages for email.send runtime action', () => {
    expect(outboundCount).toBe(1);
  });

  it('stores persona mailbox sender for outbound runtime actions', () => {
    expect(outboundSender).toBe('persona@localhost');
  });

  it('rejects unsupported runtime action names', () => {
    expect(unsupportedActionError).toContain('Unsupported runtime action');
  });

  it('supports file.read runtime actions in chat mode', () => {
    expect(fileReadContent).toBe('chat-read');
  });

  it('supports file.write runtime actions in chat mode', () => {
    expect(fileWriteContent).toBe('chat-write');
  });

  it('supports file.edit runtime actions in chat mode', () => {
    expect(fileEditContent).toBe('after after after');
  });

  it('renders simplified view and display mode in status line prefix', () => {
    expect(statusLine).toContain('[THREAD|LIGHT]');
  });

  it('renders padded command strip in status line', () => {
    expect(statusLine).toContain('{bold}{blue-fg}Ctrl+S');
  });

  it('renders command separators with additional spacing', () => {
    expect(statusLine.includes('send   {bold}{blue-fg}Ctrl+R') || statusLine.includes('send{/white-fg}   {bold}{blue-fg}Ctrl+R')).toBe(true);
  });

  it('does not duplicate footer commands as trailing status text when status is empty', () => {
    expect(statusLineWithoutMessage.includes('Enter=open thread')).toBe(false);
  });

  it('parses command hints into key-action entries', () => {
    expect(parsedStatusHintCommandsCount).toBe(3);
  });

  it('maps up key to negative scroll delta', () => {
    expect(scrollUpDelta).toBe(-1);
  });

  it('maps pagedown key to positive scroll delta', () => {
    expect(scrollPageDownDelta).toBe(8);
  });

  it('returns undefined for non-scroll bindings', () => {
    expect(scrollUnknownDelta).toBe(undefined);
  });

  it('sets thread scroll percentage to 100 for bottom anchoring', () => {
    expect(capturedScrollPercent).toBe(100);
  });

  it('adds one-space horizontal padding to each rendered chat line', () => {
    expect(paddedContent).toBe(' line-one \n line-two ');
  });

  it('formats inbox rows as four-line blocks for improved scanability', () => {
    expect(formattedInboxRow.split('\n').length).toBe(3);
  });

  it('styles inbox title and timestamp with blessed color tags', () => {
    expect(formattedInboxRow.includes('{blue-fg}') && formattedInboxRow.includes('{gray-fg}')).toBe(true);
  });

  it('renders selected and unselected marker tags in inbox rows', () => {
    expect(renderedInboxRows.includes('{blue-fg}') && renderedInboxRows.includes('{gray-fg}')).toBe(true);
  });

  it('renders themed message dots at the start of message header lines', () => {
    expect(renderedThreadContent.includes('{blue-fg}•{/blue-fg}')).toBe(true);
  });

  it('renders thread headers with continuation lines inset', () => {
    expect(renderedThreadContent.includes('\n  {cyan-fg}To: persona@localhost')).toBe(true);
  });

  it('renders message body lines inset by one leading space', () => {
    expect(renderedThreadContent.includes('\n {white-fg}Body one')).toBe(true);
  });

  it('renders attachment file path lines when message contains attachments', () => {
    expect(renderedThreadContent.includes('Attachment: /tmp/a.txt')).toBe(true);
  });

  it('inserts a blank line gap between inbox row blocks', () => {
    expect(renderedInboxRows.includes('\n\n')).toBe(true);
  });

  it('moves top row upward when selection is above viewport', () => {
    expect(topRowMovesUpToSelection).toBe(0);
  });

  it('moves top row downward when selection is below viewport', () => {
    expect(topRowMovesDownToKeepVisible).toBe(2);
  });

  it('keeps top row unchanged when selection is already visible', () => {
    expect(topRowUnchangedWhenVisible).toBe(1);
  });

  it('derives visible row count from widget height and row block height', () => {
    expect(visibleInboxRowCount).toBe(2);
  });

  it('returns bounded chat error stack previews for logging context', () => {
    expect(chatErrorStackPreviewLength).toBe(4);
  });
});
