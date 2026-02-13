import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData, resolveAttachmentLimits } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';

let tempRootPath = '';
let logsDirPath = '';
let attachmentsDirPath = '';
let perAttachmentLimitError: Error | undefined;
let totalAttachmentLimitError: Error | undefined;
let attachmentCountLimitError: Error | undefined;
let perAttachmentMessageCalls = 0;
let totalAttachmentMessageCalls = 0;
let attachmentCountMessageCalls = 0;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-limits-'));
  logsDirPath = join(tempRootPath, 'logs');
  attachmentsDirPath = join(tempRootPath, 'attachments');

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        overrides: {
          attachmentLimits: {
            maxAttachmentBytes: 1,
          },
        },
        onMessage: async (): Promise<void> => {
          perAttachmentMessageCalls += 1;
        },
      }),
    });
  } catch (error) {
    perAttachmentLimitError = error as Error;
  }

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        overrides: {
          attachmentLimits: {
            maxTotalAttachmentBytes: 1,
          },
        },
        onMessage: async (): Promise<void> => {
          totalAttachmentMessageCalls += 1;
        },
      }),
    });
  } catch (error) {
    totalAttachmentLimitError = error as Error;
  }

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        overrides: {
          attachmentLimits: {
            maxAttachmentsPerMessage: 0,
          },
        },
        onMessage: async (): Promise<void> => {
          attachmentCountMessageCalls += 1;
        },
      }),
    });
  } catch (error) {
    attachmentCountLimitError = error as Error;
  }
});

describe('gateway inbound attachment limits', () => {
  it('applies default max attachment bytes when input is absent', () => {
    expect(resolveAttachmentLimits({}).maxAttachmentBytes).toBe(10485760);
  });

  it('throws when one attachment exceeds per-file size limit', () => {
    expect(perAttachmentLimitError?.message).toBe('Attachment size exceeds configured maxAttachmentBytes.');
  });

  it('throws when total attachment size exceeds configured total limit', () => {
    expect(totalAttachmentLimitError?.message).toBe('Attachment size exceeds configured maxTotalAttachmentBytes.');
  });

  it('throws when attachment count exceeds configured count limit', () => {
    expect(attachmentCountLimitError?.message).toBe('Attachment count exceeds configured maxAttachmentsPerMessage.');
  });

  it('does not dispatch onMessage for per-file size violations', () => {
    expect(perAttachmentMessageCalls).toBe(0);
  });

  it('does not dispatch onMessage for total-size violations', () => {
    expect(totalAttachmentMessageCalls).toBe(0);
  });

  it('does not dispatch onMessage for count-limit violations', () => {
    expect(attachmentCountMessageCalls).toBe(0);
  });
});

afterAll((): void => {
  if (tempRootPath) {
    rmSync(tempRootPath, { recursive: true, force: true });
  }
});
