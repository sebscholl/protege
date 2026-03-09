import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  evaluateGatewayAuth,
  evaluateGatewayAccess,
  matchAddressRule,
  readGatewayAuthSignals,
  readSecurityRuntimeConfig,
} from '@engine/shared/security-config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let missingConfigDisabled = false;
let missingGatewayAuthEnabled = false;
let missingGatewayAuthMode = '';
let missingGatewayAuthPolicy = '';
let parsedPolicyEnabled = false;
let parsedDefaultDecision = '';
let parsedAllowCount = 0;
let parsedDenyCount = 0;
let parsedGatewayAuthEnabled = false;
let parsedGatewayAuthMode = '';
let parsedGatewayAuthPolicy = '';
let denyOverridesAllow = false;
let wildcardAllowMatch = false;
let authSignalPassSpf = '';
let authSignalPassDkim = '';
let authSignalPassDmarc = '';
let authEnforceFailAllowed = true;
let authMonitorFailAllowed = false;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-security-config-',
    chdir: false,
  });

  const missingConfig = readSecurityRuntimeConfig({
    configPath: join(workspace.tempRootPath, 'missing.json'),
  });
  missingConfigDisabled = missingConfig.gatewayAccess.enabled === false;
  missingGatewayAuthEnabled = missingConfig.gatewayAuth.enabled;
  missingGatewayAuthMode = missingConfig.gatewayAuth.mode;
  missingGatewayAuthPolicy = missingConfig.gatewayAuth.policy;

  const configPath = join(workspace.tempRootPath, 'security.json');
  writeFileSync(configPath, JSON.stringify({
    gateway_auth: {
      enabled: true,
      mode: 'enforce',
      policy: 'require_dmarc_or_aligned_spf_dkim',
      trusted_relays: [],
    },
    gateway_access: {
      enabled: true,
      default_decision: 'deny',
      allow: ['*@example.com', 'sender@*'],
      deny: ['blocked@example.com'],
    },
  }));
  const parsed = readSecurityRuntimeConfig({
    configPath,
  });
  parsedPolicyEnabled = parsed.gatewayAccess.enabled;
  parsedDefaultDecision = parsed.gatewayAccess.defaultDecision;
  parsedAllowCount = parsed.gatewayAccess.allow.length;
  parsedDenyCount = parsed.gatewayAccess.deny.length;
  parsedGatewayAuthEnabled = parsed.gatewayAuth.enabled;
  parsedGatewayAuthMode = parsed.gatewayAuth.mode;
  parsedGatewayAuthPolicy = parsed.gatewayAuth.policy;

  denyOverridesAllow = evaluateGatewayAccess({
    senderAddress: 'blocked@example.com',
    policy: parsed.gatewayAccess,
  }).allowed === false;
  wildcardAllowMatch = evaluateGatewayAccess({
    senderAddress: 'friend@example.com',
    policy: parsed.gatewayAccess,
  }).allowed === true;
  const authSignals = readGatewayAuthSignals({
    authenticationResultsHeader: 'mx.example; spf=pass smtp.mailfrom=sender@example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com',
  });
  authSignalPassSpf = authSignals.spf;
  authSignalPassDkim = authSignals.dkim;
  authSignalPassDmarc = authSignals.dmarc;
  authEnforceFailAllowed = evaluateGatewayAuth({
    policy: {
      enabled: true,
      mode: 'enforce',
      policy: 'require_dmarc_or_aligned_spf_dkim',
      trustedRelays: [],
    },
    signals: readGatewayAuthSignals({
      authenticationResultsHeader: 'mx.example; spf=fail smtp.mailfrom=sender@example.com; dkim=fail header.d=example.com; dmarc=fail header.from=example.com',
    }),
  }).allowed;
  authMonitorFailAllowed = evaluateGatewayAuth({
    policy: {
      enabled: true,
      mode: 'monitor',
      policy: 'require_dmarc_or_aligned_spf_dkim',
      trustedRelays: [],
    },
    signals: readGatewayAuthSignals({
      authenticationResultsHeader: 'mx.example; spf=fail smtp.mailfrom=sender@example.com; dkim=fail header.d=example.com; dmarc=fail header.from=example.com',
    }),
  }).allowed;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('security config parsing and rule evaluation', () => {
  it('defaults gateway access policy to disabled when security config file is missing', () => {
    expect(missingConfigDisabled).toBe(true);
  });

  it('defaults gateway auth policy to enabled monitor mode when security config file is missing', () => {
    expect([missingGatewayAuthEnabled, missingGatewayAuthMode, missingGatewayAuthPolicy]).toEqual([
      true,
      'monitor',
      'require_dmarc_or_aligned_spf_dkim',
    ]);
  });

  it('parses gateway access enabled and default decision from config file', () => {
    expect([parsedPolicyEnabled, parsedDefaultDecision]).toEqual([true, 'deny']);
  });

  it('parses configured allow and deny rule arrays', () => {
    expect([parsedAllowCount, parsedDenyCount]).toEqual([2, 1]);
  });

  it('parses gateway auth policy fields from config file', () => {
    expect([parsedGatewayAuthEnabled, parsedGatewayAuthMode, parsedGatewayAuthPolicy]).toEqual([
      true,
      'enforce',
      'require_dmarc_or_aligned_spf_dkim',
    ]);
  });

  it('applies deny rules before allow rules during gateway access evaluation', () => {
    expect(denyOverridesAllow).toBe(true);
  });

  it('applies wildcard allow rules to matching sender addresses', () => {
    expect(wildcardAllowMatch).toBe(true);
  });

  it('matches wildcard email rules with star placeholders', () => {
    expect(matchAddressRule({
      rule: '*@example.com',
      senderAddress: 'sender@example.com',
    })).toBe(true);
  });

  it('parses spf dkim and dmarc pass signals from Authentication-Results header', () => {
    expect([authSignalPassSpf, authSignalPassDkim, authSignalPassDmarc]).toEqual(['pass', 'pass', 'pass']);
  });

  it('rejects when gateway auth policy is enforce and all auth signals fail', () => {
    expect(authEnforceFailAllowed).toBe(false);
  });

  it('allows when gateway auth policy is monitor and all auth signals fail', () => {
    expect(authMonitorFailAllowed).toBe(true);
  });
});
