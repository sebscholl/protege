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
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const smtp = (typeof parsed.smtp === 'object' && parsed.smtp !== null
    ? parsed.smtp
    : {}) as Record<string, unknown>;
  return {
    host: typeof parsed.host === 'string' ? parsed.host : '127.0.0.1',
    port: typeof parsed.port === 'number' ? parsed.port : 8080,
    smtp: {
      enabled: typeof smtp.enabled === 'boolean' ? smtp.enabled : true,
      host: typeof smtp.host === 'string' ? smtp.host : '127.0.0.1',
      port: typeof smtp.port === 'number' ? smtp.port : 2526,
    },
  };
}
