import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chdir, cwd } from 'node:process';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildStatusLine,
  createChatRuntimeActionInvoker,
  resolvePersonaBySelector,
  scrollThreadBoxToBottom,
  resolveThreadScrollDelta,
} from '@engine/chat/runtime';
import { createPersona } from '@engine/shared/personas';
import { initializeDatabase } from '@engine/shared/database';

let originalCwd = '';
let tempRootPath = '';
let db: ProtegeDatabase | undefined;
let resolvedPersonaId = '';
let outboundCount = 0;
let outboundSender = '';
let unsupportedActionError = '';
let createdPersonaId = '';
let statusLine = '';
let scrollUpDelta = 0;
let scrollPageDownDelta = 0;
let scrollUnknownDelta: number | undefined;
let capturedScrollPercent = -1;

const inboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-test',
  messageId: '<message-1@localhost>',
  threadId: 'thread-1',
  from: [{ address: 'user@localhost' }],
  to: [{ address: 'persona@localhost' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'persona@localhost' }],
  subject: 'Local Chat',
  text: 'hello',
  references: [],
  receivedAt: '2026-02-19T10:00:00.000Z',
  rawMimePath: '__chat__',
  attachments: [],
};

beforeAll(async (): Promise<void> => {
  originalCwd = cwd();
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-chat-runtime-'));
  mkdirSync(join(tempRootPath, 'engine', 'shared', 'migrations'), { recursive: true });
  chdir(tempRootPath);

  const created = createPersona({
    setActive: true,
  });
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

  statusLine = buildStatusLine({
    view: 'thread',
    mode: 'compose',
    displayModeLabel: 'LIGHT',
    footerHint: 'Ctrl+Enter=send',
    statusMessage: 'Sending...',
    lastBinding: 'ctrl+enter',
    lastRawKey: 'name=enter full=C-m ctrl=1 meta=0 seq="\\r"',
  });
  scrollUpDelta = resolveThreadScrollDelta({ binding: 'up' }) ?? 0;
  scrollPageDownDelta = resolveThreadScrollDelta({ binding: 'pagedown' }) ?? 0;
  scrollUnknownDelta = resolveThreadScrollDelta({ binding: 'x' });
  scrollThreadBoxToBottom({
    threadBox: {
      setScrollPerc: (
        percent: number,
      ): void => {
        capturedScrollPercent = percent;
      },
    },
  });
});

afterAll((): void => {
  chdir(originalCwd);
  db?.close();
  rmSync(tempRootPath, { recursive: true, force: true });
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

  it('renders explicit mode and key context in status line', () => {
    expect(statusLine).toContain('[THREAD|COMPOSE|LIGHT]');
  });

  it('renders latest key binding context in status line', () => {
    expect(statusLine).toContain('key=ctrl+enter');
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
});
