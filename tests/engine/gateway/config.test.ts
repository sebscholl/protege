import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readGatewayRuntimeConfig } from '@engine/gateway/index';

let tempRootPath = '';
let validConfigMode = '';
let validConfigRelayEnabled = false;
let validConfigAttachmentMaxBytes = -1;
let missingMailDomainThrows = false;
let invalidRelayUrlThrows = false;
let invalidRelayDelayThrows = false;
let relayWithLocalhostMailDomainThrows = false;
let invalidAttachmentLimitThrows = false;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-config-'));
  mkdirSync(join(tempRootPath, 'config'), { recursive: true });

  const validConfigPath = join(tempRootPath, 'config', 'gateway-valid.json');
  writeFileSync(validConfigPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'mail.protege.bot',
    attachmentLimits: {
      maxAttachmentBytes: 10485760,
      maxAttachmentsPerMessage: 10,
      maxTotalAttachmentBytes: 26214400,
    },
    relay: {
      enabled: true,
      relayWsUrl: 'ws://127.0.0.1:8080/ws',
      reconnectBaseDelayMs: 250,
      reconnectMaxDelayMs: 8000,
      heartbeatTimeoutMs: 30000,
    },
  }));
  const validConfig = readGatewayRuntimeConfig({
    configPath: validConfigPath,
  });
  validConfigMode = validConfig.mode;
  validConfigRelayEnabled = validConfig.relay?.enabled === true;
  validConfigAttachmentMaxBytes = validConfig.attachmentLimits?.maxAttachmentBytes ?? -1;

  const missingMailDomainPath = join(tempRootPath, 'config', 'gateway-missing-mail-domain.json');
  writeFileSync(missingMailDomainPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
  }));
  try {
    readGatewayRuntimeConfig({
      configPath: missingMailDomainPath,
    });
  } catch {
    missingMailDomainThrows = true;
  }

  const invalidRelayUrlPath = join(tempRootPath, 'config', 'gateway-invalid-relay-url.json');
  writeFileSync(invalidRelayUrlPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'mail.protege.bot',
    relay: {
      enabled: true,
      relayWsUrl: 'http://127.0.0.1:8080/ws',
      reconnectBaseDelayMs: 250,
      reconnectMaxDelayMs: 8000,
      heartbeatTimeoutMs: 30000,
    },
  }));
  try {
    readGatewayRuntimeConfig({
      configPath: invalidRelayUrlPath,
    });
  } catch {
    invalidRelayUrlThrows = true;
  }

  const invalidRelayDelayPath = join(tempRootPath, 'config', 'gateway-invalid-relay-delay.json');
  writeFileSync(invalidRelayDelayPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'mail.protege.bot',
    relay: {
      enabled: true,
      relayWsUrl: 'ws://127.0.0.1:8080/ws',
      reconnectBaseDelayMs: 0,
      reconnectMaxDelayMs: 8000,
      heartbeatTimeoutMs: 30000,
    },
  }));
  try {
    readGatewayRuntimeConfig({
      configPath: invalidRelayDelayPath,
    });
  } catch {
    invalidRelayDelayThrows = true;
  }

  const relayWithLocalhostMailDomainPath = join(tempRootPath, 'config', 'gateway-relay-localhost-mail-domain.json');
  writeFileSync(relayWithLocalhostMailDomainPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'localhost',
    relay: {
      enabled: true,
      relayWsUrl: 'ws://127.0.0.1:8080/ws',
      reconnectBaseDelayMs: 250,
      reconnectMaxDelayMs: 8000,
      heartbeatTimeoutMs: 30000,
    },
  }));
  try {
    readGatewayRuntimeConfig({
      configPath: relayWithLocalhostMailDomainPath,
    });
  } catch {
    relayWithLocalhostMailDomainThrows = true;
  }

  const invalidAttachmentLimitPath = join(tempRootPath, 'config', 'gateway-invalid-attachment-limit.json');
  writeFileSync(invalidAttachmentLimitPath, JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'mail.protege.bot',
    attachmentLimits: {
      maxAttachmentBytes: 0,
    },
  }));
  try {
    readGatewayRuntimeConfig({
      configPath: invalidAttachmentLimitPath,
    });
  } catch {
    invalidAttachmentLimitThrows = true;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway runtime config validation', () => {
  it('loads valid gateway configs with relay settings', () => {
    expect(validConfigMode).toBe('dev');
  });

  it('keeps relay enabled when valid relay config is provided', () => {
    expect(validConfigRelayEnabled).toBe(true);
  });

  it('loads attachment limits when provided in gateway config', () => {
    expect(validConfigAttachmentMaxBytes).toBe(10485760);
  });

  it('fails fast when mail domain is missing', () => {
    expect(missingMailDomainThrows).toBe(true);
  });

  it('fails fast when relay websocket url uses non-websocket scheme', () => {
    expect(invalidRelayUrlThrows).toBe(true);
  });

  it('fails fast when relay timing fields are not positive integers', () => {
    expect(invalidRelayDelayThrows).toBe(true);
  });

  it('fails fast when relay is enabled with localhost mail domain', () => {
    expect(relayWithLocalhostMailDomainThrows).toBe(true);
  });

  it('fails fast when attachment limit fields are not positive integers', () => {
    expect(invalidAttachmentLimitThrows).toBe(true);
  });
});
