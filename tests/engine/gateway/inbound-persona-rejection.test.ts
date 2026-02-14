import type { GatewayInboundError } from '@engine/gateway/inbound';
import type { SMTPServerDataStream } from 'smtp-server';

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';

let tempRootPath = '';
let fallbackLogsDirPath = '';
let fallbackAttachmentsDirPath = '';
let capturedError: GatewayInboundError | undefined;
let logsDirExists = false;
let attachmentsDirExists = false;
let streamDrainedOnReject = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-inbound-persona-rejection-'));
  fallbackLogsDirPath = join(tempRootPath, 'fallback-logs');
  fallbackAttachmentsDirPath = join(tempRootPath, 'fallback-attachments');

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
      session: createFixtureSession({
        rcptToAddress: 'unknown-persona@relay-protege-mail.com',
      }),
      config: createInboundTestConfig({
        logsDirPath: fallbackLogsDirPath,
        attachmentsDirPath: fallbackAttachmentsDirPath,
        overrides: {
          requirePersonaRouting: true,
          resolvePersonaId: (): string | undefined => undefined,
        },
      }),
    });
  } catch (error) {
    capturedError = error as GatewayInboundError;
  }

  logsDirExists = existsSync(fallbackLogsDirPath);
  attachmentsDirExists = existsSync(fallbackAttachmentsDirPath);

  const stream = new Readable({
    read(): void {
      this.push(Buffer.from('discard-me', 'utf8'));
      this.push(null);
    },
  });
  stream.on('data', (): void => {
    streamDrainedOnReject = true;
  });

  try {
    await handleInboundData({
      stream: stream as SMTPServerDataStream,
      session: createFixtureSession({
        rcptToAddress: 'unknown-persona@relay-protege-mail.com',
      }),
      config: createInboundTestConfig({
        logsDirPath: fallbackLogsDirPath,
        attachmentsDirPath: fallbackAttachmentsDirPath,
        overrides: {
          requirePersonaRouting: true,
          resolvePersonaId: (): string | undefined => undefined,
        },
      }),
    });
  } catch {
    // Expected failure path.
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway inbound persona rejection', () => {
  it('rejects inbound messages when recipient does not resolve to a persona', () => {
    expect(capturedError?.code).toBe('persona_not_found');
  });

  it('does not persist raw mime or attachments to fallback storage paths', () => {
    expect(logsDirExists || attachmentsDirExists).toBe(false);
  });

  it('drains inbound smtp stream before rejecting unknown persona recipients', () => {
    expect(streamDrainedOnReject).toBe(true);
  });
});
