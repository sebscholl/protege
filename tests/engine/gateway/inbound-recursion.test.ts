import type { GatewayInboundError } from '@engine/gateway/inbound';
import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { SMTPServerDataStream } from 'smtp-server';

import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let plainInboundRecursion = -2;
let recursionOneRemaining = -2;
let recursionZeroErrorCode = '';
let recursionZeroOnMessageCalled = false;

/**
 * Creates one SMTP stream from inline MIME text.
 */
function toSmtpStream(
  args: {
    mime: string;
  },
): SMTPServerDataStream {
  return Readable.from(Buffer.from(args.mime, 'utf8')) as SMTPServerDataStream;
}

/**
 * Reads optional recursion remaining metadata value from one inbound message.
 */
function readRecursionRemaining(
  args: {
    message: InboundNormalizedMessage;
  },
): number {
  const value = args.message.metadata?.recursion_remaining;
  return typeof value === 'number' ? value : -1;
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-inbound-recursion-',
    chdir: false,
  });
  const logsDirPath = join(workspace.tempRootPath, 'logs');
  const attachmentsDirPath = join(workspace.tempRootPath, 'attachments');

  await handleInboundData({
    stream: toSmtpStream({
      mime: [
        'From: sender@example.com',
        'To: protege@localhost',
        'Subject: Plain',
        'Message-ID: <plain@example.com>',
        '',
        'hello',
      ].join('\r\n'),
    }),
    session: createFixtureSession(),
    config: createInboundTestConfig({
      logsDirPath,
      attachmentsDirPath,
      onMessage: async ({ message }): Promise<void> => {
        plainInboundRecursion = readRecursionRemaining({ message });
      },
    }),
  });

  await handleInboundData({
    stream: toSmtpStream({
      mime: [
        'From: sender@example.com',
        'To: protege@localhost',
        'Subject: Recursion One',
        'Message-ID: <rec1@example.com>',
        'X-Protege-Recursion: 1',
        '',
        'hello',
      ].join('\r\n'),
    }),
    session: createFixtureSession(),
    config: createInboundTestConfig({
      logsDirPath,
      attachmentsDirPath,
      onMessage: async ({ message }): Promise<void> => {
        recursionOneRemaining = readRecursionRemaining({ message });
      },
    }),
  });

  try {
    await handleInboundData({
      stream: toSmtpStream({
        mime: [
          'From: sender@example.com',
          'To: protege@localhost',
          'Subject: Recursion Zero',
          'Message-ID: <rec0@example.com>',
          'X-Protege-Recursion: 0',
          '',
          'hello',
        ].join('\r\n'),
      }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        onMessage: async (): Promise<void> => {
          recursionZeroOnMessageCalled = true;
        },
      }),
    });
  } catch (error) {
    recursionZeroErrorCode = (error as GatewayInboundError).code;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway inbound recursion header handling', () => {
  it('stores null recursion remaining metadata when recursion header is absent', () => {
    expect(plainInboundRecursion).toBe(-1);
  });

  it('decrements recursion header into recursion_remaining metadata', () => {
    expect(recursionOneRemaining).toBe(0);
  });

  it('rejects inbound messages when recursion header is exhausted', () => {
    expect(recursionZeroErrorCode).toBe('recursion_exhausted');
  });

  it('does not call onMessage when recursion header is exhausted', () => {
    expect(recursionZeroOnMessageCalled).toBe(false);
  });
});
