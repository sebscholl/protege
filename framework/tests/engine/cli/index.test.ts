import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  runCli,
  resolveGatewayPidFilePath,
  stopGatewayCommand,
} from '@engine/cli/index';
import { captureStdout } from '@tests/helpers/stdout';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

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
    const pidPath = resolveGatewayPidFilePath();
    if (existsSync(pidPath)) {
      rmSync(pidPath, { force: true });
    }
    expect(() => stopGatewayCommand()).not.toThrow();
  });

  it('removes pid file when pid is not numeric', () => {
    const pidPath = resolveGatewayPidFilePath();
    ensureRuntimeDirectory();
    writeFileSync(pidPath, 'not-a-number');
    stopGatewayCommand();
    expect(existsSync(pidPath)).toBe(false);
  });

  it('removes pid file when process id is stale', () => {
    const pidPath = resolveGatewayPidFilePath();
    ensureRuntimeDirectory();
    writeFileSync(pidPath, '999999');
    stopGatewayCommand();
    expect(existsSync(pidPath)).toBe(false);
  });

  it('dispatches stop command through runCli', async () => {
    const pidPath = resolveGatewayPidFilePath();
    ensureRuntimeDirectory();
    writeFileSync(pidPath, 'not-a-number');
    await runCli({ argv: ['gateway', 'stop'] });
    expect(existsSync(pidPath)).toBe(false);
  });

  it('writes the expected pid marker value for fixture setup', () => {
    const pidPath = resolveGatewayPidFilePath();
    ensureRuntimeDirectory();
    writeFileSync(pidPath, '12345');
    expect(readFileSync(pidPath, 'utf8').trim()).toBe('12345');
    rmSync(pidPath, { force: true });
  });
});

let helpOutput = '';
let shortHelpOutput = '';
let topicHelpOutput = '';
let gatewayFlagHelpOutput = '';
let daemonHelpOutput = '';
let relayBootstrapHelpOutput = '';
let relayBootstrapActionHelpOutput = '';
let versionOutput = '';
let shortVersionOutput = '';
let packageVersion = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
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
  daemonHelpOutput = await captureStdout({
    run: async (): Promise<void> => runCli({ argv: ['daemon', '--help'] }),
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

  it('prints daemon command help for daemon --help', () => {
    expect(daemonHelpOutput).toContain('Usage: protege daemon');
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
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-env-',
  });
  writeFileSync(join(workspace.tempRootPath, '.secrets'), [
    'PROTEGE_ENV_LOAD_TEST=loaded-from-dotenv',
    'PROTEGE_ENV_LOCAL_OVERRIDE_TEST=from-dotenv',
  ].join('\n'), 'utf8');
  writeFileSync(join(workspace.tempRootPath, '.secrets.local'), [
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
  workspace.cleanup();
  delete process.env.PROTEGE_ENV_LOAD_TEST;
  delete process.env.PROTEGE_ENV_LOCAL_OVERRIDE_TEST;
  delete process.env.PROTEGE_ENV_OVERRIDE_TEST;
});

describe('cli secrets loading behavior', () => {
  it('loads secrets values from cwd .secrets file', () => {
    expect(loadedEnvValue).toBe('loaded-from-dotenv');
  });

  it('does not override pre-existing environment values', () => {
    expect(preservedEnvValue).toBe('pre-existing');
  });

  it('allows .secrets.local to override .secrets for non-shell variables', () => {
    expect(envLocalOverrideValue).toBe('from-dotenv-local');
  });
});
