import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readRelayRuntimeConfig } from '@relay/src/config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let defaultHost = '';
let defaultSmtpEnabled = false;
let defaultSmtpMaxMessageBytes = 0;
let defaultSmtpMaxRecipients = 0;
let defaultWsIdleTimeoutMs = 0;
let defaultConsoleLogFormat = '';
let defaultDkimEnabled = false;
let validConfigPort = 0;
let validConfigSmtpRateLimit = 0;
let validConsoleLogFormat = '';
let validDkimEnabled = false;
let validDkimDomainName = '';
let validDkimPrivateKeyLoaded = false;
let invalidHostThrows = false;
let invalidSmtpThrows = false;
let invalidRateLimitThrows = false;
let invalidEnabledDkimThrows = false;

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
  defaultSmtpMaxMessageBytes = defaultConfig.smtp.maxMessageBytes;
  defaultSmtpMaxRecipients = defaultConfig.smtp.maxRecipients;
  defaultWsIdleTimeoutMs = defaultConfig.ws.idleTimeoutMs;
  defaultConsoleLogFormat = defaultConfig.logging.consoleLogFormat;
  defaultDkimEnabled = defaultConfig.dkim.enabled;

  workspace.writeFile({
    relativePath: join('relay', 'keys', 'dkim.private.key'),
    payload: `-----BEGIN PRIVATE KEY-----
test-private-key
-----END PRIVATE KEY-----`,
  });

  const validConfigPath = join(workspace.tempRootPath, 'relay', 'config-valid.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-valid.json'),
    payload: {
      host: '127.0.0.1',
      port: 8080,
      logging: {
        consoleLogFormat: 'pretty',
        prettyLogThemePath: join(workspace.tempRootPath, 'relay', 'theme.json'),
      },
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 5_000_000,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 30,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 300000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 1000,
        challengeGcIntervalMs: 60000,
      },
      ws: {
        heartbeatIntervalMs: 30000,
        idleTimeoutMs: 120000,
      },
      dkim: {
        enabled: true,
        domainName: 'mail.protege.bot',
        keySelector: 'default',
        privateKeyPath: join('keys', 'dkim.private.key'),
        headerFieldNames: 'from:to:subject:date',
        skipFields: 'message-id',
      },
    },
  });
  const validConfig = readRelayRuntimeConfig({
    configPath: validConfigPath,
  });
  validConfigPort = validConfig.port;
  validConfigSmtpRateLimit = validConfig.rateLimits.smtpMessagesPerMinutePerIp;
  validConsoleLogFormat = validConfig.logging.consoleLogFormat;
  validDkimEnabled = validConfig.dkim.enabled;
  validDkimDomainName = validConfig.dkim.domainName;
  validDkimPrivateKeyLoaded = validConfig.dkim.privateKey.includes('BEGIN PRIVATE KEY');

  const invalidHostConfigPath = join(workspace.tempRootPath, 'relay', 'config-invalid-host.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-invalid-host.json'),
    payload: {
      host: '',
      port: 8080,
      logging: {
        consoleLogFormat: 'json',
        prettyLogThemePath: join(workspace.tempRootPath, 'relay', 'theme.json'),
      },
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 10485760,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 30,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 300000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 1000,
        challengeGcIntervalMs: 60000,
      },
      ws: {
        heartbeatIntervalMs: 30000,
        idleTimeoutMs: 120000,
      },
      dkim: {
        enabled: false,
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
      logging: {
        consoleLogFormat: 'json',
        prettyLogThemePath: join(workspace.tempRootPath, 'relay', 'theme.json'),
      },
      smtp: {
        enabled: 'yes',
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 10485760,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 30,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 300000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 1000,
        challengeGcIntervalMs: 60000,
      },
      ws: {
        heartbeatIntervalMs: 30000,
        idleTimeoutMs: 120000,
      },
      dkim: {
        enabled: false,
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

  const invalidRateLimitConfigPath = join(workspace.tempRootPath, 'relay', 'config-invalid-rate-limit.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-invalid-rate-limit.json'),
    payload: {
      host: '127.0.0.1',
      port: 8080,
      logging: {
        consoleLogFormat: 'json',
        prettyLogThemePath: join(workspace.tempRootPath, 'relay', 'theme.json'),
      },
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 10485760,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 0,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 300000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 1000,
        challengeGcIntervalMs: 60000,
      },
      ws: {
        heartbeatIntervalMs: 30000,
        idleTimeoutMs: 120000,
      },
      dkim: {
        enabled: false,
      },
    },
  });
  try {
    readRelayRuntimeConfig({
      configPath: invalidRateLimitConfigPath,
    });
  } catch {
    invalidRateLimitThrows = true;
  }

  const invalidEnabledDkimConfigPath = join(workspace.tempRootPath, 'relay', 'config-invalid-dkim.json');
  workspace.writeFile({
    relativePath: join('relay', 'config-invalid-dkim.json'),
    payload: {
      host: '127.0.0.1',
      port: 8080,
      logging: {
        consoleLogFormat: 'json',
        prettyLogThemePath: join(workspace.tempRootPath, 'relay', 'theme.json'),
      },
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 10485760,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 30,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 300000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 1000,
        challengeGcIntervalMs: 60000,
      },
      ws: {
        heartbeatIntervalMs: 30000,
        idleTimeoutMs: 120000,
      },
      dkim: {
        enabled: true,
        domainName: 'mail.protege.bot',
        keySelector: 'default',
        privateKeyPath: '',
      },
    },
  });
  try {
    readRelayRuntimeConfig({
      configPath: invalidEnabledDkimConfigPath,
    });
  } catch {
    invalidEnabledDkimThrows = true;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('relay runtime config validation', () => {
  it('returns fallback defaults when config file is missing', () => {
    expect(defaultHost).toBe('127.0.0.1');
  });

  it('uses json as fallback relay console log format', () => {
    expect(defaultConsoleLogFormat).toBe('json');
  });

  it('disables dkim by default when config file is missing', () => {
    expect(defaultDkimEnabled).toBe(false);
  });

  it('enables smtp by default when config file is missing', () => {
    expect(defaultSmtpEnabled).toBe(true);
  });

  it('sets smtp payload limits in fallback defaults', () => {
    expect(defaultSmtpMaxMessageBytes > 0 && defaultSmtpMaxRecipients === 1).toBe(true);
  });

  it('sets websocket timeout defaults when config file is missing', () => {
    expect(defaultWsIdleTimeoutMs > 0).toBe(true);
  });

  it('loads valid relay config files with explicit ports', () => {
    expect(validConfigPort).toBe(8080);
  });

  it('loads valid relay rate limit values from config', () => {
    expect(validConfigSmtpRateLimit).toBe(30);
  });

  it('loads valid relay logging format values from config', () => {
    expect(validConsoleLogFormat).toBe('pretty');
  });

  it('loads dkim enabled state from config', () => {
    expect(validDkimEnabled).toBe(true);
  });

  it('loads dkim domain value from config', () => {
    expect(validDkimDomainName).toBe('mail.protege.bot');
  });

  it('loads dkim private key from configured file path', () => {
    expect(validDkimPrivateKeyLoaded).toBe(true);
  });

  it('fails fast when relay host is blank', () => {
    expect(invalidHostThrows).toBe(true);
  });

  it('fails fast when smtp.enabled is not a boolean', () => {
    expect(invalidSmtpThrows).toBe(true);
  });

  it('fails fast when one rate limit value is not a positive integer', () => {
    expect(invalidRateLimitThrows).toBe(true);
  });

  it('fails fast when dkim is enabled without a private key path', () => {
    expect(invalidEnabledDkimThrows).toBe(true);
  });
});
