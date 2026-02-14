import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readRelayRuntimeConfig } from '@relay/src/config';

let tempRootPath = '';
let defaultHost = '';
let defaultSmtpEnabled = false;
let validConfigPort = 0;
let invalidHostThrows = false;
let invalidSmtpThrows = false;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-relay-config-'));
  mkdirSync(join(tempRootPath, 'relay'), { recursive: true });

  const defaultConfig = readRelayRuntimeConfig({
    configPath: join(tempRootPath, 'relay', 'missing.json'),
  });
  defaultHost = defaultConfig.host;
  defaultSmtpEnabled = defaultConfig.smtp.enabled;

  const validConfigPath = join(tempRootPath, 'relay', 'config-valid.json');
  writeFileSync(validConfigPath, JSON.stringify({
    host: '127.0.0.1',
    port: 8080,
    smtp: {
      enabled: true,
      host: '127.0.0.1',
      port: 2526,
    },
  }));
  validConfigPort = readRelayRuntimeConfig({
    configPath: validConfigPath,
  }).port;

  const invalidHostConfigPath = join(tempRootPath, 'relay', 'config-invalid-host.json');
  writeFileSync(invalidHostConfigPath, JSON.stringify({
    host: '',
    port: 8080,
    smtp: {
      enabled: true,
      host: '127.0.0.1',
      port: 2526,
    },
  }));
  try {
    readRelayRuntimeConfig({
      configPath: invalidHostConfigPath,
    });
  } catch {
    invalidHostThrows = true;
  }

  const invalidSmtpConfigPath = join(tempRootPath, 'relay', 'config-invalid-smtp.json');
  writeFileSync(invalidSmtpConfigPath, JSON.stringify({
    host: '127.0.0.1',
    port: 8080,
    smtp: {
      enabled: 'yes',
      host: '127.0.0.1',
      port: 2526,
    },
  }));
  try {
    readRelayRuntimeConfig({
      configPath: invalidSmtpConfigPath,
    });
  } catch {
    invalidSmtpThrows = true;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
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
