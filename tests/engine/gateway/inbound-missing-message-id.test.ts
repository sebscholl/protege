import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';

let tempRootPath = '';
let logsDirPath = '';
let attachmentsDirPath = '';
let capturedMessage: InboundNormalizedMessage | undefined;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-no-message-id-'));
  logsDirPath = join(tempRootPath, 'logs');
  attachmentsDirPath = join(tempRootPath, 'attachments');

  await handleInboundData({
    stream: createFixtureStream({ fixtureFileName: 'email-without-message-id.eml' }),
    session: createFixtureSession(),
    config: createInboundTestConfig({
      logsDirPath,
      attachmentsDirPath,
      onMessage: async ({ message }): Promise<void> => {
        capturedMessage = message;
      },
    }),
  });
});

afterAll((): void => {
  if (tempRootPath) {
    rmSync(tempRootPath, { recursive: true, force: true });
  }
});

describe('gateway inbound message-id fallback', () => {
  it('creates a synthetic message id when inbound header is missing', () => {
    expect(capturedMessage?.messageId.startsWith('<synthetic.')).toBe(true);
  });

  it('assigns a deterministic thread id from synthetic message id', () => {
    expect((capturedMessage?.threadId.length ?? 0) > 30).toBe(true);
  });

  it('persists a raw mime artifact for missing message-id emails', () => {
    expect(capturedMessage?.rawMimePath.includes('gateway/inbound')).toBe(true);
  });
});
