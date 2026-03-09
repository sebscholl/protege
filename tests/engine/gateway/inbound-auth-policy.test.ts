import type { GatewayInboundError } from '@engine/gateway/inbound';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { evaluateGatewayAuth, readGatewayAuthSignals } from '@engine/shared/security-config';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let logsDirPath = '';
let attachmentsDirPath = '';
let enforceCapturedError: GatewayInboundError | undefined;
let monitorCapturedError: GatewayInboundError | undefined;
let monitorOnMessageCalled = false;
let enforceLogsDirExistsAfterDeny = true;
let enforcePassOnMessageCalled = false;
let enforcePassCapturedError: GatewayInboundError | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-inbound-auth-policy-',
    chdir: false,
  });
  logsDirPath = join(workspace.tempRootPath, 'logs');
  attachmentsDirPath = join(workspace.tempRootPath, 'attachments');

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-auth-fail.eml' }),
      session: createFixtureSession(),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        overrides: {
          evaluateSenderAuth: ({ authenticationResultsHeader }) => evaluateGatewayAuth({
            policy: {
              enabled: true,
              mode: 'enforce',
              policy: 'require_dmarc_or_aligned_spf_dkim',
              trustedRelays: [],
            },
            signals: readGatewayAuthSignals({
              authenticationResultsHeader,
            }),
          }),
        },
      }),
    });
  } catch (error) {
    enforceCapturedError = error as GatewayInboundError;
  }

  enforceLogsDirExistsAfterDeny = existsSync(logsDirPath);

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-auth-fail.eml' }),
      session: createFixtureSession({
        sessionId: 'session-monitor',
      }),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        onMessage: async (): Promise<void> => {
          monitorOnMessageCalled = true;
        },
        overrides: {
          evaluateSenderAuth: ({ authenticationResultsHeader }) => evaluateGatewayAuth({
            policy: {
              enabled: true,
              mode: 'monitor',
              policy: 'require_dmarc_or_aligned_spf_dkim',
              trustedRelays: [],
            },
            signals: readGatewayAuthSignals({
              authenticationResultsHeader,
            }),
          }),
        },
      }),
    });
  } catch (error) {
    monitorCapturedError = error as GatewayInboundError;
  }

  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-auth-pass.eml' }),
      session: createFixtureSession({
        sessionId: 'session-enforce-pass',
      }),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        onMessage: async (): Promise<void> => {
          enforcePassOnMessageCalled = true;
        },
        overrides: {
          evaluateSenderAuth: ({ authenticationResultsHeader }) => evaluateGatewayAuth({
            policy: {
              enabled: true,
              mode: 'enforce',
              policy: 'require_dmarc_or_aligned_spf_dkim',
              trustedRelays: [],
            },
            signals: readGatewayAuthSignals({
              authenticationResultsHeader,
            }),
          }),
        },
      }),
    });
  } catch (error) {
    enforcePassCapturedError = error as GatewayInboundError;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway inbound authentication policy', () => {
  it('rejects inbound messages when auth policy is enforce and sender auth fails', () => {
    expect(enforceCapturedError?.code).toBe('auth_failed');
  });

  it('does not persist inbound artifacts when auth policy enforcement rejects sender', () => {
    expect(enforceLogsDirExistsAfterDeny).toBe(false);
  });

  it('allows inbound message processing when auth policy is monitor and sender auth fails', () => {
    expect(monitorOnMessageCalled).toBe(true);
  });

  it('does not raise auth failure under monitor mode for failed sender auth', () => {
    expect(monitorCapturedError).toBeUndefined();
  });

  it('allows inbound message processing when auth policy is enforce and sender auth passes', () => {
    expect(enforcePassOnMessageCalled).toBe(true);
  });

  it('does not raise auth failure under enforce mode for pass signals', () => {
    expect(enforcePassCapturedError).toBeUndefined();
  });
});
