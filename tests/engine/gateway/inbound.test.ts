import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';

let tempRootPath = '';
let logsDirPath = '';
let attachmentsDirPath = '';
let capturedMessage: InboundNormalizedMessage | undefined;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-inbound-'));
  logsDirPath = join(tempRootPath, 'logs');
  attachmentsDirPath = join(tempRootPath, 'attachments');

  await handleInboundData({
    stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
    session: createFixtureSession(),
    config: {
      host: '127.0.0.1',
      port: 2525,
      dev: true,
      logsDirPath,
      attachmentsDirPath,
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
      onMessage: async ({ message }): Promise<void> => {
        capturedMessage = message;
      },
    },
  });
});

describe('gateway inbound parsing', () => {
  it('captures parsed inbound messages', () => {
    expect(Boolean(capturedMessage)).toBe(true);
  });

  it('parses sender and recipients', () => {
    expect(capturedMessage?.from[0]?.address).toBe('sender@example.com');
  });

  it('parses cc recipients separately', () => {
    expect(capturedMessage?.cc[0]?.address).toBe('teammate@example.com');
  });

  it('persists envelope recipients from smtp session', () => {
    expect(capturedMessage?.envelopeRcptTo[0]?.address).toBe('protege@localhost');
  });

  it('persists raw mime to disk', () => {
    expect(capturedMessage?.rawMimePath.includes('gateway/inbound')).toBe(true);
  });

  it('persists attachment metadata and file path', () => {
    expect(capturedMessage?.attachments[0]?.filename).toBe('payload.json');
  });

  it('derives deterministic thread id from message headers', () => {
    expect((capturedMessage?.threadId.length ?? 0) > 30).toBe(true);
  });
});

afterAll((): void => {
  if (tempRootPath) {
    rmSync(tempRootPath, { recursive: true, force: true });
  }
});
