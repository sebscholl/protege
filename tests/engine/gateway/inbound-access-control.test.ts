import type { GatewayInboundError } from '@engine/gateway/inbound';

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { evaluateGatewayAccess } from '@engine/shared/security-config';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';

let tempRootPath = '';
let logsDirPath = '';
let attachmentsDirPath = '';
let capturedError: GatewayInboundError | undefined;
let onMessageCalled = false;
let logsDirExistsAfterDeny = false;
let attachmentsDirExistsAfterDeny = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-inbound-access-control-'));
  logsDirPath = join(tempRootPath, 'logs');
  attachmentsDirPath = join(tempRootPath, 'attachments');

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-plain.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        onMessage: async (): Promise<void> => {
          onMessageCalled = true;
        },
        overrides: {
          evaluateSenderAccess: ({ senderAddress }) => evaluateGatewayAccess({
            senderAddress,
            policy: {
              enabled: true,
              defaultDecision: 'deny',
              allow: [],
              deny: [],
            },
          }),
        },
      }),
    });
  } catch (error) {
    capturedError = error as GatewayInboundError;
  }

  logsDirExistsAfterDeny = existsSync(logsDirPath);
  attachmentsDirExistsAfterDeny = existsSync(attachmentsDirPath);
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway inbound access control', () => {
  it('rejects inbound messages when sender is denied by gateway access policy', () => {
    expect(capturedError?.code).toBe('access_denied');
  });

  it('does not invoke downstream inbound onMessage handler for denied senders', () => {
    expect(onMessageCalled).toBe(false);
  });

  it('does not create storage directories when sender is denied before persistence', () => {
    expect(logsDirExistsAfterDeny || attachmentsDirExistsAfterDeny).toBe(false);
  });
});
