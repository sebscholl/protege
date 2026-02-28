import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli, stopGatewayCommand } from '@engine/cli/index';
import { captureStdout } from '@tests/helpers/stdout';

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

let helpOutput = '';
let shortHelpOutput = '';
let topicHelpOutput = '';
let gatewayFlagHelpOutput = '';
let relayBootstrapHelpOutput = '';
let relayBootstrapActionHelpOutput = '';
let versionOutput = '';
let shortVersionOutput = '';
let packageVersion = '';
let envTempRootPath = '';
let previousCwd = '';
let loadedEnvValue = '';
let preservedEnvValue = '';
let envLocalOverrideValue = '';

beforeAll(async (): Promise<void> => {
  helpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['--help'] }),
  });
  shortHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['-h'] }),
  });
  topicHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['help', 'gateway'] }),
  });
  gatewayFlagHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['gateway', '--help'] }),
  });
  relayBootstrapHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['help', 'relay', 'bootstrap'] }),
  });
  relayBootstrapActionHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['relay', 'bootstrap', '--help'] }),
  });
  versionOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['--version'] }),
  });
  shortVersionOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['-v'] }),
  });
  packageVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version as string;
});

describe('top-level cli flags', () => {
  it('prints usage for --help', () => {
    expect(helpOutput).toContain('Usage: protege');
  });

  it('prints usage for -h', () => {
    expect(shortHelpOutput).toContain('Usage: protege');
  });

  it('prints command-specific help for help <command>', () => {
    expect(topicHelpOutput).toContain('Usage: protege gateway');
  });

  it('prints command-specific help for <command> --help', () => {
    expect(gatewayFlagHelpOutput).toContain('Usage: protege gateway');
  });

  it('prints subcommand help for help <command> <action>', () => {
    expect(relayBootstrapHelpOutput).toContain('Usage: protege relay bootstrap');
  });

  it('prints subcommand help for <command> <action> --help', () => {
    expect(relayBootstrapActionHelpOutput).toContain('Usage: protege relay bootstrap');
  });

  it('prints package version for --version', () => {
    expect(versionOutput.trim()).toBe(packageVersion);
  });

  it('prints package version for -v', () => {
    expect(shortVersionOutput.trim()).toBe(packageVersion);
  });
});

beforeAll(async (): Promise<void> => {
  envTempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-env-'));
  previousCwd = process.cwd();
  process.chdir(envTempRootPath);
  writeFileSync(join(envTempRootPath, '.env'), [
    'PROTEGE_ENV_LOAD_TEST=loaded-from-dotenv',
    'PROTEGE_ENV_LOCAL_OVERRIDE_TEST=from-dotenv',
  ].join('\n'), 'utf8');
  writeFileSync(join(envTempRootPath, '.env.local'), [
    'PROTEGE_ENV_LOCAL_OVERRIDE_TEST=from-dotenv-local',
    'PROTEGE_ENV_OVERRIDE_TEST=from-dotenv-local',
  ].join('\n'), 'utf8');

  delete process.env.PROTEGE_ENV_LOAD_TEST;
  delete process.env.PROTEGE_ENV_LOCAL_OVERRIDE_TEST;
  process.env.PROTEGE_ENV_OVERRIDE_TEST = 'pre-existing';
  await runCli({ argv: ['--help'] });
  loadedEnvValue = String(process.env.PROTEGE_ENV_LOAD_TEST ?? '');
  envLocalOverrideValue = String(process.env.PROTEGE_ENV_LOCAL_OVERRIDE_TEST ?? '');
  preservedEnvValue = String(process.env.PROTEGE_ENV_OVERRIDE_TEST ?? '');
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(envTempRootPath, { recursive: true, force: true });
  delete process.env.PROTEGE_ENV_LOAD_TEST;
  delete process.env.PROTEGE_ENV_LOCAL_OVERRIDE_TEST;
  delete process.env.PROTEGE_ENV_OVERRIDE_TEST;
});

describe('cli dotenv loading behavior', () => {
  it('loads dotenv values from cwd .env file', () => {
    expect(loadedEnvValue).toBe('loaded-from-dotenv');
  });

  it('does not override pre-existing environment values', () => {
    expect(preservedEnvValue).toBe('pre-existing');
  });

  it('allows .env.local to override .env for non-shell variables', () => {
    expect(envLocalOverrideValue).toBe('from-dotenv-local');
  });
});
