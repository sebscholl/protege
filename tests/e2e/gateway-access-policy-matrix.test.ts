import type { GatewayAccessPolicyConfig } from '@engine/shared/security-config';
import type { InboundErrorCode } from '@engine/gateway/inbound';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { readSecurityRuntimeConfig, evaluateGatewayAccess } from '@engine/shared/security-config';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let disabledPolicyAllowed = false;
let defaultAllowAllowed = false;
let defaultDenyDeniedCode = '';
let explicitAllowAllowed = false;
let denyOverridesAllowDeniedCode = '';
let deniedScenarioCreatedStorage = true;

/**
 * Executes one inbound attempt against one gateway access policy.
 */
async function runPolicyScenario(
  args: {
    policy: GatewayAccessPolicyConfig;
    scenarioName: string;
    senderAddress?: string;
  },
): Promise<{
  onMessageCalled: boolean;
  errorCode?: InboundErrorCode;
  logsDirExists: boolean;
  attachmentsDirExists: boolean;
}> {
  workspace.patchConfigFiles({
    'security.json': {
      gateway_access: {
        enabled: args.policy.enabled,
        default_decision: args.policy.defaultDecision,
        allow: args.policy.allow,
        deny: args.policy.deny,
      },
    },
  });
  const logsDirPath = join(workspace.tempRootPath, 'tmp', 'policy-e2e', args.scenarioName, 'logs');
  const attachmentsDirPath = join(workspace.tempRootPath, 'tmp', 'policy-e2e', args.scenarioName, 'attachments');
  let onMessageCalled = false;
  let errorCode: InboundErrorCode | undefined;
  try {
    await handleInboundData({
      stream: createFixtureStream({ fixtureFileName: 'email-plain.eml' }),
      session: createFixtureSession({
        mailFromAddress: args.senderAddress ?? 'sender@example.com',
      }),
      config: createInboundTestConfig({
        logsDirPath,
        attachmentsDirPath,
        onMessage: async (): Promise<void> => {
          onMessageCalled = true;
        },
        overrides: {
          evaluateSenderAccess: ({ senderAddress }) => evaluateGatewayAccess({
            senderAddress,
            policy: readSecurityRuntimeConfig({
              configPath: join(workspace.tempRootPath, 'configs', 'security.json'),
            }).gatewayAccess,
          }),
        },
      }),
    });
  } catch (error) {
    errorCode = (error as { code?: InboundErrorCode }).code;
  }

  return {
    onMessageCalled,
    errorCode,
    logsDirExists: existsSync(logsDirPath),
    attachmentsDirExists: existsSync(attachmentsDirPath),
  };
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-gateway-access-policy-',
    chdir: false,
  });

  const disabled = await runPolicyScenario({
    scenarioName: 'disabled',
    policy: {
      enabled: false,
      defaultDecision: 'deny',
      allow: [],
      deny: [],
    },
  });
  disabledPolicyAllowed = disabled.onMessageCalled === true;

  const defaultAllow = await runPolicyScenario({
    scenarioName: 'default-allow',
    policy: {
      enabled: true,
      defaultDecision: 'allow',
      allow: [],
      deny: [],
    },
  });
  defaultAllowAllowed = defaultAllow.onMessageCalled === true;

  const defaultDeny = await runPolicyScenario({
    scenarioName: 'default-deny',
    policy: {
      enabled: true,
      defaultDecision: 'deny',
      allow: [],
      deny: [],
    },
  });
  defaultDenyDeniedCode = defaultDeny.errorCode ?? '';
  deniedScenarioCreatedStorage = defaultDeny.logsDirExists || defaultDeny.attachmentsDirExists;

  const explicitAllow = await runPolicyScenario({
    scenarioName: 'explicit-allow',
    policy: {
      enabled: true,
      defaultDecision: 'deny',
      allow: ['sender@example.com'],
      deny: [],
    },
  });
  explicitAllowAllowed = explicitAllow.onMessageCalled === true;

  const denyOverridesAllow = await runPolicyScenario({
    scenarioName: 'deny-overrides-allow',
    policy: {
      enabled: true,
      defaultDecision: 'deny',
      allow: ['*@example.com'],
      deny: ['sender@example.com'],
    },
  });
  denyOverridesAllowDeniedCode = denyOverridesAllow.errorCode ?? '';
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway access policy matrix e2e', () => {
  it('allows inbound when gateway access policy is disabled', () => {
    expect(disabledPolicyAllowed).toBe(true);
  });

  it('allows inbound when policy is enabled with default allow and no matching rules', () => {
    expect(defaultAllowAllowed).toBe(true);
  });

  it('denies inbound when policy is enabled with default deny and no matching allow rules', () => {
    expect(defaultDenyDeniedCode).toBe('access_denied');
  });

  it('allows inbound when explicit allow rule matches under default deny policy', () => {
    expect(explicitAllowAllowed).toBe(true);
  });

  it('denies inbound when deny and allow both match because deny takes precedence', () => {
    expect(denyOverridesAllowDeniedCode).toBe('access_denied');
  });

  it('does not create storage artifacts for denied inbound messages', () => {
    expect(deniedScenarioCreatedStorage).toBe(false);
  });
});
