import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readRelayRuntimeConfig } from '@relay/src/config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let defaultHost = '';
let defaultSmtpEnabled = false;
let validConfigPort = 0;
let invalidHostThrows = false;
let invalidSmtpThrows = false;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-relay-config-',
    chdir: false,
  });

  const defaultConfig = readRelayRuntimeConfig({
    configPath: join(workspace.tempRootPath, 'relay', 'missing.json'),
  });
  defaultHost = defaultConfig.host;
  defaultSmtpEnabled = defaultConfig.smtp.enabled;

  const validConfigPath = join(workspace.tempRootPath, 'relay', 'config-valid.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-valid.json'),
    payload: {
      host: '127.0.0.1',
      port: 8080,
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
      },
    },
  });
  validConfigPort = readRelayRuntimeConfig({
    configPath: validConfigPath,
  }).port;

  const invalidHostConfigPath = join(workspace.tempRootPath, 'relay', 'config-invalid-host.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-invalid-host.json'),
    payload: {
      host: '',
      port: 8080,
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
      },
    },
  });
  try {
    readRelayRuntimeConfig({
      configPath: invalidHostConfigPath,
    });
  } catch {
    invalidHostThrows = true;
  }

  const invalidSmtpConfigPath = join(workspace.tempRootPath, 'relay', 'config-invalid-smtp.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-invalid-smtp.json'),
    payload: {
      host: '127.0.0.1',
      port: 8080,
      smtp: {
        enabled: 'yes',
        host: '127.0.0.1',
        port: 2526,
      },
    },
  });
  try {
    readRelayRuntimeConfig({
      configPath: invalidSmtpConfigPath,
    });
  } catch {
    invalidSmtpThrows = true;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('relay runtime config validation', () => {
  it('returns fallback defaults when config file is missing', () => {
    expect(defaultHost).toBe('127.0.0.1');
  });

  it('enables smtp by default when config file is missing', () => {
    expect(defaultSmtpEnabled).toBe(true);
  });

  it('loads valid relay config files with explicit ports', () => {
    expect(validConfigPort).toBe(8080);
  });

  it('fails fast when relay host is blank', () => {
    expect(invalidHostThrows).toBe(true);
  });

  it('fails fast when smtp.enabled is not a boolean', () => {
    expect(invalidSmtpThrows).toBe(true);
  });
});
