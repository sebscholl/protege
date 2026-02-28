import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readGatewayRuntimeConfig, resolveDefaultGatewayConfigPath, startGatewayRuntime } from '@engine/gateway/index';

const PID_FILE_PATH = join(process.cwd(), 'tmp', 'gateway.pid');

/**
 * Dispatches gateway-specific CLI commands.
 */
export async function runGatewayCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const [action, modeFlag] = args.argv;
  if (!action) {
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
    stopGatewayByProcessScan();
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
  stopGatewayByProcessScan();
}

/**
 * Stops orphaned gateway start processes when pid marker is missing or stale.
 */
export function stopGatewayByProcessScan(): void {
  const pids = listGatewayStartProcessIds();
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore processes that already exited.
    }
  }
}

/**
 * Lists process ids that match the gateway start command shape.
 */
export function listGatewayStartProcessIds(): number[] {
  try {
    const output = execSync('pgrep -f "engine/cli/index.ts gateway start"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}
