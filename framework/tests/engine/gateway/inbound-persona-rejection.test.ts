import type { GatewayInboundError } from '@engine/gateway/inbound';
import type { SMTPServerDataStream } from 'smtp-server';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData, toPublicInboundSmtpError } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let fallbackLogsDirPath = '';
let fallbackAttachmentsDirPath = '';
let capturedError: GatewayInboundError | undefined;
let logsDirExists = false;
let attachmentsDirExists = false;
let streamDrainedOnReject = false;
let publicRejectMessage = '';
let publicRejectCode: number | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-inbound-persona-rejection-',
    chdir: false,
  });
  fallbackLogsDirPath = join(workspace.tempRootPath, 'fallback-logs');
  fallbackAttachmentsDirPath = join(workspace.tempRootPath, 'fallback-attachments');

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

  if (capturedError) {
    const publicSmtpError = toPublicInboundSmtpError({
      error: capturedError,
    }) as Error & {
      responseCode?: number;
    };
    publicRejectMessage = publicSmtpError.message;
    publicRejectCode = publicSmtpError.responseCode;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway inbound persona rejection', () => {
  it('rejects inbound messages when recipient does not resolve to a persona', () => {
    expect(capturedError?.code).toBe('persona_not_found');
  });

  it('retains internal persona-not-found detail for logs and telemetry', () => {
    expect(capturedError?.message.includes('did not map to a known persona')).toBe(true);
  });

  it('returns a generic public smtp rejection message for unknown recipients', () => {
    expect(publicRejectMessage).toBe('Requested action not taken: mailbox unavailable.');
  });

  it('returns a mailbox-unavailable smtp response code for unknown recipients', () => {
    expect(publicRejectCode).toBe(550);
  });

  it('does not persist raw mime or attachments to fallback storage paths', () => {
    expect(logsDirExists || attachmentsDirExists).toBe(false);
  });

  it('drains inbound smtp stream before rejecting unknown persona recipients', () => {
    expect(streamDrainedOnReject).toBe(true);
  });
});
