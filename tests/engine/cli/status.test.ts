import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { createPersona, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { captureStdout } from '@tests/helpers/stdout';

let tempRootPath = '';
let previousCwd = '';
let statusJson = {} as Record<string, unknown>;
let statusText = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-status-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  writeFileSync(join(tempRootPath, 'config', 'gateway.json'), JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'mail.protege.bot',
    relay: {
      enabled: true,
      relayWsUrl: 'ws://relay.test/ws',
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1000,
      heartbeatTimeoutMs: 5000,
    },
  }, null, 2));
  writeFileSync(join(tempRootPath, 'config', 'system.json'), JSON.stringify({
    logs_dir_path: join(tempRootPath, 'tmp', 'logs'),
    console_log_format: 'json',
  }, null, 2));

  const persona = createPersona({
  });
  const memoryPaths = resolvePersonaMemoryPaths({
    personaId: persona.personaId,
  });
  writeFileSync(memoryPaths.temporalDbPath, '');

  statusJson = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['status', '--json'],
    }),
  })).trim()) as Record<string, unknown>;
  statusText = await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['status'],
    }),
  });
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('status cli command', () => {
  it('prints json output when --json is set', () => {
    expect(typeof statusJson.gateway).toBe('object');
  });

  it('reports relay enabled state from gateway config', () => {
    expect((statusJson.relay as Record<string, unknown>).enabled).toBe(true);
  });

  it('reports persona memory temporal db coverage count', () => {
    const memory = statusJson.memory as Record<string, unknown>;
    expect(memory.personasWithTemporalDb).toBe(1);
  });

  it('prints readable status lines without --json', () => {
    expect(statusText.includes('gateway.running')).toBe(true);
  });
});
