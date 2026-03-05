import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { createPersona } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { captureStdout } from '@tests/helpers/stdout';

let tempRootPath = '';
let previousCwd = '';
let healthyStatus = '';
let healthyChecksCount = 0;
let unhealthyStatus = '';
let unhealthyExitCode = -1;
let doctorText = '';
let relayIdentityCheckStatus = '';
let healthyFailedCheckIds: string[] = [];
let workspace = undefined as ReturnType<typeof createTestWorkspaceFromFixture> | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-doctor-',
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;

  workspace.patchConfigFiles({
    'gateway.json': {
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
    },
    'inference.json': {
      provider: 'openai',
      model: 'gpt-4.1',
      recursion_depth: 3,
    },
    'system.json': {
      logs_dir_path: join(tempRootPath, 'tmp', 'logs'),
      console_log_format: 'json',
      admin_contact_email: 'ops@example.com',
    },
  });
  workspace.patchExtensionsManifest({
    providers: [
      {
        name: 'openai',
        config: {
          api_key_env: 'OPENAI_API_KEY',
        },
      },
    ],
    tools: ['send-email'],
    hooks: [],
  });
  workspace.writeFile({
    relativePath: 'extensions/providers/openai/config.json',
    payload: {
      api_key_env: 'OPENAI_API_KEY',
      base_url: 'https://api.openai.com/v1',
    },
  });
  process.env.OPENAI_API_KEY = 'test-key';
  createPersona({
    emailDomain: 'mail.protege.bot',
  });

  process.exitCode = 0;
  const healthyJson = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['doctor', '--json'],
    }),
  })).trim()) as {
    status: string;
    checks: Array<Record<string, unknown>>;
  };
  healthyStatus = healthyJson.status;
  healthyChecksCount = healthyJson.checks.length;
  healthyFailedCheckIds = healthyJson.checks
    .filter((check) => String(check.status ?? '') === 'fail')
    .map((check) => String(check.id ?? ''));
  relayIdentityCheckStatus = String(
    healthyJson.checks.find(
      (check) => check.id === 'relay.persona_sender_domains_consistent',
    )?.status ?? '',
  );

  doctorText = await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['doctor'],
    }),
  });

  workspace.patchConfigFiles({
    'inference.json': {
      provider: 'openai',
      model: 'gpt-4.1',
      recursion_depth: 3,
    },
  });
  workspace.patchExtensionsManifest({
    providers: [
      {
        name: 'openai',
        config: {
          api_key_env: 'OPENAI_API_KEY_MISSING',
        },
      },
    ],
    tools: ['send-email'],
    hooks: [],
  });
  process.exitCode = 0;
  const unhealthyJson = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['doctor', '--json'],
    }),
  })).trim()) as {
    status: string;
  };
  unhealthyStatus = unhealthyJson.status;
  unhealthyExitCode = process.exitCode ?? 0;
});

afterAll((): void => {
  process.exitCode = 0;
  workspace?.cleanup();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
});

describe('doctor cli command', () => {
  it('returns healthy status when core config and persona setup are valid', () => {
    expect(healthyStatus).toBe('healthy');
  });

  it('has no failing checks in healthy setup', () => {
    expect(healthyFailedCheckIds).toEqual([]);
  });

  it('includes expected doctor check entries in json output', () => {
    expect(healthyChecksCount).toBe(9);
  });

  it('validates relay persona sender domains when relay is enabled', () => {
    expect(relayIdentityCheckStatus).toBe('pass');
  });

  it('prints human-readable status lines without --json', () => {
    expect(doctorText.includes('status:')).toBe(true);
  });

  it('returns unhealthy status when selected provider credentials are missing', () => {
    expect(unhealthyStatus).toBe('unhealthy');
  });

  it('sets non-zero exit code when doctor reports unhealthy', () => {
    expect(unhealthyExitCode).toBe(1);
  });
});
