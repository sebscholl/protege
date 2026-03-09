import type { SMTPServerDataStream } from 'smtp-server';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  GatewayInboundError,
  handleInboundData,
  readStreamBuffer,
} from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let logsDirPath = '';
let blockedAttachmentsBasePath = '';
let writeFailureError: GatewayInboundError | undefined;
let writeFailureMessageCalls = 0;

/**
 * Creates a fixture stream that emits an error before completion.
 */
function createErrorStream(): SMTPServerDataStream {
  const stream = new Readable({
    read(): void {
      this.push(Buffer.from('partial', 'utf8'));
      this.destroy(new Error('stream failure'));
    },
  });
  return stream as SMTPServerDataStream;
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-inbound-failures-',
    chdir: false,
  });
  logsDirPath = join(workspace.tempRootPath, 'logs');
  blockedAttachmentsBasePath = join(workspace.tempRootPath, 'blocked-attachments-root');
  writeFileSync(blockedAttachmentsBasePath, 'file-not-directory');

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath: blockedAttachmentsBasePath,
        onMessage: async (): Promise<void> => {
          writeFailureMessageCalls += 1;
        },
      }),
    });
  } catch (error) {
    writeFailureError = error as GatewayInboundError;
  }
});

describe('gateway inbound failure behavior', () => {
  it('rejects when inbound smtp stream emits an error', async () => {
    await expect(readStreamBuffer({ stream: createErrorStream() })).rejects.toMatchObject({ code: 'stream_read_error' });
  });

  it('classifies attachment write-path failures with a stable reason code', () => {
    expect(writeFailureError?.code).toBe('attachment_write_failed');
  });

  it('does not dispatch onMessage when attachment persistence fails', () => {
    expect(writeFailureMessageCalls).toBe(0);
  });
});

afterAll((): void => {
  workspace.cleanup();
});
