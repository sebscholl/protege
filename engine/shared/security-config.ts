import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Represents the full security runtime config payload.
 */
export type SecurityRuntimeConfig = {
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
  return join(process.cwd(), 'config', 'security.json');
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
  const gatewayAccessRecord = asRecord({
    value: parsed.gateway_access,
  });

  return {
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
