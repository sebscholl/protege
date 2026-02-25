import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { captureStdout } from '@tests/helpers/stdout';

let tempRootPath = '';
let previousCwd = '';
let projectPath = '';
let firstCreatedCount = 0;
let secondSkippedCount = 0;
let forceCreatedCount = 0;
let gatewayConfigExists = false;
let toolsReadmeExists = false;
let sentinelPreserved = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-init-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);
  projectPath = join(tempRootPath, 'sample-project');

  const firstResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath],
    }),
  })).trim()) as {
    createdFiles: string[];
  };
  firstCreatedCount = firstResult.createdFiles.length;
  gatewayConfigExists = existsSync(join(projectPath, 'config', 'gateway.json'));
  toolsReadmeExists = existsSync(join(projectPath, 'extensions', 'tools', 'README.md'));

  const sentinelPath = join(projectPath, 'config', 'gateway.json');
  const sentinelValue = '{"sentinel":"keep"}\n';
  writeFileSync(sentinelPath, sentinelValue);

  const secondResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath],
    }),
  })).trim()) as {
    skippedFiles: string[];
  };
  secondSkippedCount = secondResult.skippedFiles.length;
  sentinelPreserved = readFileSync(sentinelPath, 'utf8') === sentinelValue;

  const forceResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath, '--force'],
    }),
  })).trim()) as {
    createdFiles: string[];
  };
  forceCreatedCount = forceResult.createdFiles.length;
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('init cli command', () => {
  it('creates scaffold files on first run', () => {
    expect(firstCreatedCount > 5).toBe(true);
  });

  it('writes gateway config scaffold into target path', () => {
    expect(gatewayConfigExists).toBe(true);
  });

  it('writes extensions tools directory readme scaffold into target path', () => {
    expect(toolsReadmeExists).toBe(true);
  });

  it('skips existing files when --force is omitted', () => {
    expect(secondSkippedCount > 0).toBe(true);
  });

  it('preserves existing files when --force is omitted', () => {
    expect(sentinelPreserved).toBe(true);
  });

  it('recreates scaffold files when --force is used', () => {
    expect(forceCreatedCount > 5).toBe(true);
  });
});
