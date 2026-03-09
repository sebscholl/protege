import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Represents one gateway access policy default decision.
 */
export type GatewayAccessDefaultDecision = 'allow' | 'deny';

/**
 * Represents one normalized gateway access policy config.
 */
export type GatewayAccessPolicyConfig = {
  enabled: boolean;
  defaultDecision: GatewayAccessDefaultDecision;
  allow: string[];
  deny: string[];
};

/**
 * Represents one gateway authentication runtime mode.
 */
export type GatewayAuthMode = 'monitor' | 'enforce';

/**
 * Represents one gateway authentication policy strategy.
 */
export type GatewayAuthPolicy = 'require_dmarc_or_aligned_spf_dkim';

/**
 * Represents one normalized gateway authentication policy config.
 */
export type GatewayAuthPolicyConfig = {
  enabled: boolean;
  mode: GatewayAuthMode;
  policy: GatewayAuthPolicy;
  trustedRelays: Array<{
    keyId: string;
    publicKeyPem: string;
  }>;
};

/**
 * Represents one parsed sender-auth signal set from message authentication headers.
 */
export type GatewayAuthSignals = {
  spf: 'pass' | 'fail' | 'unknown';
  dkim: 'pass' | 'fail' | 'unknown';
  dmarc: 'pass' | 'fail' | 'unknown';
};

/**
 * Represents one gateway sender-auth policy evaluation result.
 */
export type GatewayAuthEvaluation = {
  allowed: boolean;
  reason:
    | 'disabled'
    | 'monitor_pass'
    | 'monitor_fail'
    | 'enforce_pass'
    | 'enforce_fail';
  mode: GatewayAuthMode;
  policy: GatewayAuthPolicy;
  signals: GatewayAuthSignals;
};

/**
 * Represents the full security runtime config payload.
 */
export type SecurityRuntimeConfig = {
  gatewayAuth: GatewayAuthPolicyConfig;
  gatewayAccess: GatewayAccessPolicyConfig;
};

/**
 * Represents one access-policy evaluation result for one sender.
 */
export type GatewayAccessEvaluation = {
  allowed: boolean;
  reason: 'disabled' | 'deny_rule' | 'allow_rule' | 'default_allow' | 'default_deny';
  matchedRule?: string;
};

/**
 * Resolves the default security config path in repository config.
 */
export function resolveDefaultSecurityConfigPath(): string {
  return join(process.cwd(), 'configs', 'security.json');
}

/**
 * Reads security runtime config from disk and applies defaults when absent.
 */
export function readSecurityRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): SecurityRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultSecurityConfigPath();
  if (!existsSync(configPath)) {
    return readDefaultSecurityRuntimeConfig();
  }

  const parsed = readJsonRecord({
    filePath: configPath,
  });
  const gatewayAuthRecord = asRecord({
    value: parsed.gateway_auth,
  });
  const gatewayAccessRecord = asRecord({
    value: parsed.gateway_access,
  });

  return {
    gatewayAuth: {
      enabled: typeof gatewayAuthRecord?.enabled === 'boolean'
        ? gatewayAuthRecord.enabled
        : true,
      mode: readGatewayAuthMode({
        value: gatewayAuthRecord?.mode,
      }),
      policy: readGatewayAuthPolicy({
        value: gatewayAuthRecord?.policy,
      }),
      trustedRelays: readTrustedRelayPublicKeys({
        value: gatewayAuthRecord?.trusted_relays,
        configPath,
      }),
    },
    gatewayAccess: {
      enabled: typeof gatewayAccessRecord?.enabled === 'boolean'
        ? gatewayAccessRecord.enabled
        : false,
      defaultDecision: readGatewayDefaultDecision({
        value: gatewayAccessRecord?.default_decision,
      }),
      allow: readRuleArray({
        value: gatewayAccessRecord?.allow,
      }),
      deny: readRuleArray({
        value: gatewayAccessRecord?.deny,
      }),
    },
  };
}

/**
 * Returns default security runtime config when no file is present.
 */
export function readDefaultSecurityRuntimeConfig(): SecurityRuntimeConfig {
  return {
    gatewayAuth: {
      enabled: true,
      mode: 'monitor',
      policy: 'require_dmarc_or_aligned_spf_dkim',
      trustedRelays: [],
    },
    gatewayAccess: {
      enabled: false,
      defaultDecision: 'allow',
      allow: [],
      deny: [],
    },
  };
}

/**
 * Evaluates one sender address against configured gateway access rules.
 */
export function evaluateGatewayAccess(
  args: {
    senderAddress: string;
    policy: GatewayAccessPolicyConfig;
  },
): GatewayAccessEvaluation {
  if (!args.policy.enabled) {
    return {
      allowed: true,
      reason: 'disabled',
    };
  }

  const normalizedSenderAddress = args.senderAddress.trim().toLowerCase();
  const matchedDenyRule = args.policy.deny.find((rule) => matchAddressRule({
    rule,
    senderAddress: normalizedSenderAddress,
  }));
  if (matchedDenyRule) {
    return {
      allowed: false,
      reason: 'deny_rule',
      matchedRule: matchedDenyRule,
    };
  }

  const matchedAllowRule = args.policy.allow.find((rule) => matchAddressRule({
    rule,
    senderAddress: normalizedSenderAddress,
  }));
  if (matchedAllowRule) {
    return {
      allowed: true,
      reason: 'allow_rule',
      matchedRule: matchedAllowRule,
    };
  }

  if (args.policy.defaultDecision === 'allow') {
    return {
      allowed: true,
      reason: 'default_allow',
    };
  }

  return {
    allowed: false,
    reason: 'default_deny',
  };
}

/**
 * Matches one sender address against one wildcard rule.
 */
export function matchAddressRule(
  args: {
    rule: string;
    senderAddress: string;
  },
): boolean {
  const normalizedRule = args.rule.trim().toLowerCase();
  if (normalizedRule.length === 0) {
    return false;
  }
  const escapedRule = normalizedRule.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = `^${escapedRule.replace(/\*/g, '.*')}$`;
  const ruleRegex = new RegExp(regexPattern);
  return ruleRegex.test(args.senderAddress);
}

/**
 * Reads one valid gateway default decision value from config.
 */
export function readGatewayDefaultDecision(
  args: {
    value: unknown;
  },
): GatewayAccessDefaultDecision {
  if (args.value === 'allow' || args.value === 'deny') {
    return args.value;
  }

  return 'allow';
}

/**
 * Reads one valid gateway auth mode value from config.
 */
export function readGatewayAuthMode(
  args: {
    value: unknown;
  },
): GatewayAuthMode {
  if (args.value === 'monitor' || args.value === 'enforce') {
    return args.value;
  }

  return 'monitor';
}

/**
 * Reads one valid gateway auth policy value from config.
 */
export function readGatewayAuthPolicy(
  args: {
    value: unknown;
  },
): GatewayAuthPolicy {
  if (args.value === 'require_dmarc_or_aligned_spf_dkim') {
    return args.value;
  }

  return 'require_dmarc_or_aligned_spf_dkim';
}

/**
 * Parses gateway sender-auth signals from one Authentication-Results header value.
 */
export function readGatewayAuthSignals(
  args: {
    authenticationResultsHeader: unknown;
  },
): GatewayAuthSignals {
  const header = toAuthenticationResultsString({
    value: args.authenticationResultsHeader,
  });
  if (!header) {
    return {
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
    };
  }

  return {
    spf: readAuthResultToken({
      header,
      tokenName: 'spf',
    }),
    dkim: readAuthResultToken({
      header,
      tokenName: 'dkim',
    }),
    dmarc: readAuthResultToken({
      header,
      tokenName: 'dmarc',
    }),
  };
}

/**
 * Evaluates gateway sender-auth policy using parsed authentication signals.
 */
export function evaluateGatewayAuth(
  args: {
    policy: GatewayAuthPolicyConfig;
    signals: GatewayAuthSignals;
  },
): GatewayAuthEvaluation {
  if (!args.policy.enabled) {
    return {
      allowed: true,
      reason: 'disabled',
      mode: args.policy.mode,
      policy: args.policy.policy,
      signals: args.signals,
    };
  }

  const policyPassed = args.signals.dmarc === 'pass'
    || args.signals.spf === 'pass'
    || args.signals.dkim === 'pass';

  if (args.policy.mode === 'monitor') {
    return {
      allowed: true,
      reason: policyPassed ? 'monitor_pass' : 'monitor_fail',
      mode: args.policy.mode,
      policy: args.policy.policy,
      signals: args.signals,
    };
  }

  return {
    allowed: policyPassed,
    reason: policyPassed ? 'enforce_pass' : 'enforce_fail',
    mode: args.policy.mode,
    policy: args.policy.policy,
    signals: args.signals,
  };
}

/**
 * Reads one rule list from config and normalizes entries.
 */
export function readRuleArray(
  args: {
    value: unknown;
  },
): string[] {
  if (!Array.isArray(args.value)) {
    return [];
  }

  return args.value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

/**
 * Returns value as record when input is a plain object.
 */
export function asRecord(
  args: {
    value: unknown;
  },
): Record<string, unknown> | undefined {
  return typeof args.value === 'object'
    && args.value !== null
    && !Array.isArray(args.value)
    ? args.value as Record<string, unknown>
    : undefined;
}

/**
 * Reads one JSON file and returns it as a generic record.
 */
export function readJsonRecord(
  args: {
    filePath: string;
  },
): Record<string, unknown> {
  const text = readFileSync(args.filePath, 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Converts one Authentication-Results header value into one normalized string when present.
 */
export function toAuthenticationResultsString(
  args: {
    value: unknown;
  },
): string | undefined {
  if (typeof args.value === 'string' && args.value.trim().length > 0) {
    return args.value.trim();
  }
  if (Array.isArray(args.value)) {
    const values = args.value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    return values.length > 0 ? values.join('; ') : undefined;
  }

  return undefined;
}

/**
 * Reads one result token (`pass`/`fail`) from one Authentication-Results header string.
 */
export function readAuthResultToken(
  args: {
    header: string;
    tokenName: 'spf' | 'dkim' | 'dmarc';
  },
): 'pass' | 'fail' | 'unknown' {
  const pattern = new RegExp(`${args.tokenName}\\s*=\\s*([a-zA-Z]+)`, 'i');
  const match = pattern.exec(args.header);
  if (!match || !match[1]) {
    return 'unknown';
  }

  const value = match[1].toLowerCase();
  if (value === 'pass') {
    return 'pass';
  }
  if (value === 'fail') {
    return 'fail';
  }
  return 'unknown';
}

/**
 * Reads trusted relay public-key records from config.
 */
export function readTrustedRelayPublicKeys(
  args: {
    value: unknown;
    configPath: string;
  },
): Array<{
  keyId: string;
  publicKeyPem: string;
}> {
  if (!Array.isArray(args.value)) {
    return [];
  }

  const parsed: Array<{ keyId: string; publicKeyPem: string }> = [];
  for (const item of args.value) {
    const record = asRecord({
      value: item,
    });
    if (!record) {
      continue;
    }

    const keyId = typeof record.key_id === 'string' && record.key_id.trim().length > 0
      ? record.key_id.trim()
      : undefined;
    if (!keyId) {
      continue;
    }

    const inlinePublicKeyPem = typeof record.public_key_pem === 'string' && record.public_key_pem.trim().length > 0
      ? record.public_key_pem.trim()
      : undefined;
    if (inlinePublicKeyPem) {
      parsed.push({
        keyId,
        publicKeyPem: inlinePublicKeyPem,
      });
      continue;
    }

    const publicKeyPath = typeof record.public_key_path === 'string' && record.public_key_path.trim().length > 0
      ? record.public_key_path.trim()
      : undefined;
    if (!publicKeyPath) {
      continue;
    }

    const resolvedPublicKeyPath = isAbsolute(publicKeyPath)
      ? publicKeyPath
      : resolve(dirname(args.configPath), publicKeyPath);
    if (!existsSync(resolvedPublicKeyPath)) {
      throw new Error(`Security config at ${args.configPath} references missing gateway_auth.trusted_relays public key path: ${resolvedPublicKeyPath}`);
    }
    const publicKeyPem = readFileSync(resolvedPublicKeyPath, 'utf8').trim();
    if (publicKeyPem.length <= 0) {
      throw new Error(`Security config at ${args.configPath} references empty gateway_auth.trusted_relays public key path: ${resolvedPublicKeyPath}`);
    }

    parsed.push({
      keyId,
      publicKeyPem,
    });
  }

  return parsed;
}
