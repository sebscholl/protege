import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

let tempRootPath = '';
let parsedLogsDirPath = '';
let parsedConsoleFormat = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-config-'));
  const configPath = join(tempRootPath, 'system.json');
  writeFileSync(configPath, JSON.stringify({
    logs_dir_path: 'tmp/logs',
    console_log_format: 'pretty',
  }));

  const parsed = readGlobalRuntimeConfig({ configPath });
  parsedLogsDirPath = parsed.logsDirPath;
  parsedConsoleFormat = parsed.consoleLogFormat;
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('global runtime config', () => {
  it('parses configured logs directory path', () => {
    expect(parsedLogsDirPath).toBe('tmp/logs');
  });

  it('parses configured pretty console log format', () => {
    expect(parsedConsoleFormat).toBe('pretty');
  });
});
