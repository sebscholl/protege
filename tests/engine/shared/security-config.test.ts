import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  evaluateGatewayAccess,
  matchAddressRule,
  readSecurityRuntimeConfig,
} from '@engine/shared/security-config';

let tempRootPath = '';
let missingConfigDisabled = false;
let parsedPolicyEnabled = false;
let parsedDefaultDecision = '';
let parsedAllowCount = 0;
let parsedDenyCount = 0;
let denyOverridesAllow = false;
let wildcardAllowMatch = false;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-security-config-'));

  missingConfigDisabled = readSecurityRuntimeConfig({
    configPath: join(tempRootPath, 'missing.json'),
  }).gatewayAccess.enabled === false;

  const configPath = join(tempRootPath, 'security.json');
  writeFileSync(configPath, JSON.stringify({
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

  denyOverridesAllow = evaluateGatewayAccess({
    senderAddress: 'blocked@example.com',
    policy: parsed.gatewayAccess,
  }).allowed === false;
  wildcardAllowMatch = evaluateGatewayAccess({
    senderAddress: 'friend@example.com',
    policy: parsed.gatewayAccess,
  }).allowed === true;
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('security config parsing and rule evaluation', () => {
  it('defaults gateway access policy to disabled when security config file is missing', () => {
    expect(missingConfigDisabled).toBe(true);
  });

  it('parses gateway access enabled and default decision from config file', () => {
    expect([parsedPolicyEnabled, parsedDefaultDecision]).toEqual([true, 'deny']);
  });

  it('parses configured allow and deny rule arrays', () => {
    expect([parsedAllowCount, parsedDenyCount]).toEqual([2, 1]);
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
});
