import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGatewayRuntimeConfig, resolveDefaultGatewayConfigPath, startGatewayRuntime } from '@engine/gateway/index';

const PID_FILE_PATH = join(process.cwd(), 'tmp', 'gateway.pid');

/**
 * Runs the Protege CLI argument parser and dispatches known commands.
 */
export async function runCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const [area, action, modeFlag] = args.argv;
  if (area !== 'gateway' || !action) {
    throw new Error('Usage: protege gateway <start|stop|restart> [--dev]');
  }

  if (action === 'start') {
    await startGatewayCommand({
      dev: modeFlag === '--dev',
    });
    return;
  }

  if (action === 'stop') {
    stopGatewayCommand();
    return;
  }

  if (action === 'restart') {
    stopGatewayCommand();
    await startGatewayCommand({
      dev: modeFlag === '--dev',
    });
    return;
  }

  throw new Error('Usage: protege gateway <start|stop|restart> [--dev]');
}

/**
 * Starts the gateway runtime in foreground mode and writes pid marker.
 */
export async function startGatewayCommand(
  args: {
    dev: boolean;
  },
): Promise<void> {
  const configPath = resolveDefaultGatewayConfigPath();
  const baseConfig = readGatewayRuntimeConfig({ configPath });
  const runtimeConfig = args.dev
    ? {
        ...baseConfig,
        mode: 'dev' as const,
      }
    : baseConfig;

  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(PID_FILE_PATH, String(process.pid));

  await startGatewayRuntime({
    config: runtimeConfig,
  });
}

/**
 * Stops a tracked gateway process by pid marker when available.
 */
export function stopGatewayCommand(): void {
  if (!existsSync(PID_FILE_PATH)) {
    return;
  }

  const pidText = readFileSync(PID_FILE_PATH, 'utf8').trim();
  const pid = Number(pidText);
  if (!Number.isNaN(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore if process is already gone.
    }
  }

  unlinkSync(PID_FILE_PATH);
}

/**
 * Executes CLI using process arguments when run as node entrypoint.
 */
async function runProcessCli(): Promise<void> {
  await runCli({
    argv: process.argv.slice(2),
  });
}

/**
 * Returns true when this module is executing as the direct process entrypoint.
 */
export function isCliEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntrypoint()) {
  void runProcessCli();
}
