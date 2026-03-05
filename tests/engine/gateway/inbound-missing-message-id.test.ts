import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let logsDirPath = '';
let attachmentsDirPath = '';
let capturedMessage: InboundNormalizedMessage | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-no-message-id-',
    chdir: false,
  });
  logsDirPath = join(workspace.tempRootPath, 'logs');
  attachmentsDirPath = join(workspace.tempRootPath, 'attachments');

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
  workspace.cleanup();
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
