import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';

let tempRootPath = '';
let previousCwd = '';
let jsonOutputLines: string[] = [];
let prettyOutputLines: string[] = [];

/**
 * Captures stdout output from one async CLI command execution.
 */
async function captureStdout(
  args: {
    run: () => Promise<void>;
  },
): Promise<string> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  try {
    await args.run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join('');
}

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-logs-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  const logsDirPath = join(tempRootPath, 'tmp', 'logs');
  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(logsDirPath, { recursive: true });
  writeFileSync(join(tempRootPath, 'config', 'system.json'), JSON.stringify({
    logs_dir_path: logsDirPath,
    console_log_format: 'json',
  }, null, 2));
  writeFileSync(join(logsDirPath, 'protege.log'), [
    JSON.stringify({
      level: 'info',
      scope: 'gateway',
      event: 'gateway.inbound.received',
      timestamp: '2026-02-16T00:00:00.000Z',
    }),
    JSON.stringify({
      level: 'info',
      scope: 'harness',
      event: 'harness.inference.started',
      timestamp: '2026-02-16T00:00:01.000Z',
    }),
    JSON.stringify({
      level: 'info',
      scope: 'gateway',
      event: 'gateway.outbound.sent',
      timestamp: '2026-02-16T00:00:02.000Z',
    }),
  ].join('\n'));

  jsonOutputLines = (await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['logs', '--json', '--scope', 'gateway', '--tail', '1'],
    }),
  }))
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
  prettyOutputLines = (await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['logs', '--scope', 'harness', '--tail', '10'],
    }),
  }))
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('logs cli command', () => {
  it('prints json logs unchanged when --json is set', () => {
    expect(jsonOutputLines[0]?.includes('"scope":"gateway"')).toBe(true);
  });

  it('applies --tail count after scope filtering', () => {
    expect(jsonOutputLines.length).toBe(1);
  });

  it('filters output lines by requested scope', () => {
    expect(prettyOutputLines[0]?.includes('harness.harness.inference.started')).toBe(true);
  });

  it('renders non-json output in readable pretty format', () => {
    expect(prettyOutputLines[0]?.startsWith('[2026-02-16T00:00:01.000Z] INFO')).toBe(true);
  });
});
