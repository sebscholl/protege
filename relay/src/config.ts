import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents one relay runtime configuration.
 */
export type RelayRuntimeConfig = {
  host: string;
  port: number;
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
  };
};

/**
 * Resolves default relay config path under relay directory.
 */
export function resolveDefaultRelayConfigPath(): string {
  return join(process.cwd(), 'relay', 'config.json');
}

/**
 * Reads relay runtime config from disk with fallback defaults.
 */
export function readRelayRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): RelayRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultRelayConfigPath();
  if (!existsSync(configPath)) {
    return {
      host: '127.0.0.1',
      port: 8080,
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
      },
    };
  }

  const text = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(text) as unknown;
  return validateRelayRuntimeConfig({
    parsed,
    configPath,
  });
}

/**
 * Validates parsed relay runtime config and returns normalized values.
 */
export function validateRelayRuntimeConfig(
  args: {
    parsed: unknown;
    configPath: string;
  },
): RelayRuntimeConfig {
  if (!isRecord({
    value: args.parsed,
  })) {
    throw new Error(`Relay config at ${args.configPath} must be a JSON object.`);
  }
  const parsed = args.parsed as Record<string, unknown>;

  const host = readNonEmptyString({
    value: parsed.host,
    fieldPath: 'host',
    configPath: args.configPath,
  });
  const port = readPort({
    value: parsed.port,
    fieldPath: 'port',
    configPath: args.configPath,
  });
  if (!isRecord({
    value: parsed.smtp,
  })) {
    throw new Error(`Relay config at ${args.configPath} field smtp must be an object.`);
  }
  const smtp = parsed.smtp as Record<string, unknown>;
  return {
    host,
    port,
    smtp: {
      enabled: readBoolean({
        value: smtp.enabled,
        fieldPath: 'smtp.enabled',
        configPath: args.configPath,
      }),
      host: readNonEmptyString({
        value: smtp.host,
        fieldPath: 'smtp.host',
        configPath: args.configPath,
      }),
      port: readPort({
        value: smtp.port,
        fieldPath: 'smtp.port',
        configPath: args.configPath,
      }),
    },
  };
}

/**
 * Returns true when one unknown value is a non-null object record.
 */
export function isRecord(
  args: {
    value: unknown;
  },
): boolean {
  return typeof args.value === 'object' && args.value !== null && !Array.isArray(args.value);
}

/**
 * Reads one required non-empty string config value.
 */
export function readNonEmptyString(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a non-empty string.`);
  }

  return args.value;
}

/**
 * Reads one required boolean config value.
 */
export function readBoolean(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): boolean {
  if (typeof args.value !== 'boolean') {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a boolean.`);
  }

  return args.value;
}

/**
 * Reads one required positive integer config value.
 */
export function readPositiveInteger(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  if (!Number.isInteger(args.value) || (args.value as number) <= 0) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a positive integer.`);
  }

  return args.value as number;
}

/**
 * Reads one required TCP port within standard range.
 */
export function readPort(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  const port = readPositiveInteger(args);
  if (port < 1 || port > 65535) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be within 1-65535.`);
  }

  return port;
}
