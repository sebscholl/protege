import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { captureStdout } from '@tests/helpers/stdout';

let tempRootPath = '';
let jsonOutputLines: string[] = [];
let prettyOutputLines: string[] = [];
let schedulerOutputLines: string[] = [];
let chatOutputLines: string[] = [];
let prettyOutputLinesSansAnsi: string[] = [];
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-logs-',
  });
  tempRootPath = workspace.tempRootPath;

  const logsDirPath = join(tempRootPath, 'tmp', 'logs');
  mkdirSync(logsDirPath, { recursive: true });
  workspace.patchConfigFiles({
    'system.json': {
      logs_dir_path: logsDirPath,
      console_log_format: 'json',
    },
  });
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
      correlationId: 'corr-123',
      threadId: 'thread-abc',
    }),
    JSON.stringify({
      level: 'info',
      scope: 'gateway',
      event: 'gateway.outbound.sent',
      timestamp: '2026-02-16T00:00:02.000Z',
    }),
    JSON.stringify({
      level: 'info',
      scope: 'scheduler',
      event: 'scheduler.run.completed',
      timestamp: '2026-02-16T00:00:03.000Z',
    }),
    JSON.stringify({
      level: 'info',
      scope: 'chat',
      event: 'chat.thread.updated',
      timestamp: '2026-02-16T00:00:04.000Z',
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
  prettyOutputLinesSansAnsi = prettyOutputLines.map((line) => stripAnsi({
    value: line,
  }));
  schedulerOutputLines = (await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['logs', '--json', '--scope', 'scheduler', '--tail', '10'],
    }),
  }))
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
  chatOutputLines = (await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['logs', '--json', '--scope', 'chat', '--tail', '10'],
    }),
  }))
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
});

afterAll((): void => {
  workspace.cleanup();
});

describe('logs cli command', () => {
  it('prints json logs unchanged when --json is set', () => {
    expect(jsonOutputLines[0]?.includes('"scope":"gateway"')).toBe(true);
  });

  it('applies --tail count after scope filtering', () => {
    expect(jsonOutputLines.length).toBe(1);
  });

  it('filters output lines by requested scope', () => {
    expect(prettyOutputLinesSansAnsi[0]?.includes('harness harness.inference.started')).toBe(true);
  });

  it('renders non-json output in readable pretty format', () => {
    expect(prettyOutputLinesSansAnsi[0]?.includes('[2026-02-16T00:00:01.000Z]')).toBe(true);
  });

  it('prints pretty context rows for non-header fields', () => {
    expect(prettyOutputLinesSansAnsi.some((line) => line.includes('correlationId=corr-123'))).toBe(true);
  });

  it('filters output lines by scheduler scope', () => {
    expect(schedulerOutputLines[0]?.includes('"scope":"scheduler"')).toBe(true);
  });

  it('filters output lines by chat scope', () => {
    expect(chatOutputLines[0]?.includes('"scope":"chat"')).toBe(true);
  });
});

/**
 * Removes ANSI escape sequences from one captured console line.
 */
export function stripAnsi(
  args: {
    value: string;
  },
): string {
  return args.value.replace(/\u001b\[[0-9;]*m/g, '');
}
