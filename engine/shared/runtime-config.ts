import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents global runtime configuration shared across engine services.
 */
export type GlobalRuntimeConfig = {
  logsDirPath: string;
  consoleLogFormat: 'json' | 'pretty';
};

/**
 * Resolves default global runtime config path.
 */
export function resolveDefaultGlobalConfigPath(): string {
  return join(process.cwd(), 'config', 'system.json');
}

/**
 * Reads global runtime config and applies defaults when file is absent.
 */
export function readGlobalRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): GlobalRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultGlobalConfigPath();
  if (!existsSync(configPath)) {
    return {
      logsDirPath: join(process.cwd(), 'tmp', 'logs'),
      consoleLogFormat: 'json',
    };
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const logsDirPath = typeof parsed.logs_dir_path === 'string' && parsed.logs_dir_path.length > 0
    ? parsed.logs_dir_path
    : join(process.cwd(), 'tmp', 'logs');
  const consoleLogFormat = parsed.console_log_format === 'pretty' ? 'pretty' : 'json';
  return {
    logsDirPath,
    consoleLogFormat,
  };
}
