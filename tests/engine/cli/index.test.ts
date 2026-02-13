import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli, stopGatewayCommand } from '@engine/cli/index';

const PID_PATH = join(process.cwd(), 'tmp', 'gateway.pid');

/**
 * Ensures the tmp runtime directory exists before pid-file assertions.
 */
function ensureRuntimeDirectory(): void {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
}

describe('gateway cli lifecycle behavior', () => {
  it('throws usage error for invalid command shapes', async () => {
    await expect(runCli({ argv: ['gateway'] })).rejects.toThrow('Usage: protege gateway');
  });

  it('returns safely when stop is called without pid file', () => {
    if (existsSync(PID_PATH)) {
      rmSync(PID_PATH, { force: true });
    }
    expect(() => stopGatewayCommand()).not.toThrow();
  });

  it('removes pid file when pid is not numeric', () => {
    ensureRuntimeDirectory();
    writeFileSync(PID_PATH, 'not-a-number');
    stopGatewayCommand();
    expect(existsSync(PID_PATH)).toBe(false);
  });

  it('removes pid file when process id is stale', () => {
    ensureRuntimeDirectory();
    writeFileSync(PID_PATH, '999999');
    stopGatewayCommand();
    expect(existsSync(PID_PATH)).toBe(false);
  });

  it('dispatches stop command through runCli', async () => {
    ensureRuntimeDirectory();
    writeFileSync(PID_PATH, 'not-a-number');
    await runCli({ argv: ['gateway', 'stop'] });
    expect(existsSync(PID_PATH)).toBe(false);
  });

  it('writes the expected pid marker value for fixture setup', () => {
    ensureRuntimeDirectory();
    writeFileSync(PID_PATH, '12345');
    expect(readFileSync(PID_PATH, 'utf8').trim()).toBe('12345');
    rmSync(PID_PATH, { force: true });
  });
});
