import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayInboundProcessingConfig,
  isEmailAddress,
  reconcilePersonaMailboxDomains,
} from '@engine/gateway/index';
import { createPersona, readPersonaMetadata } from '@engine/shared/personas';

let relayClientMapIsPreserved = false;
let localhostAddressValid = false;
let relayDomainReconciled = false;
let tempRootPath = '';
let previousCwd = '';

beforeAll((): void => {
  previousCwd = process.cwd();
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-index-'));
  process.chdir(tempRootPath);
  mkdirSync(join(tempRootPath, 'personas'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });

  const relayClientsByPersonaId = new Map<string, {
    stop: () => void;
    sendTextMessage: (
      args: {
        messageJson: string;
      },
    ) => void;
    sendBinaryFrame: (
      args: {
        frame: Buffer;
      },
    ) => void;
    readStatus: () => {
      connected: boolean;
      authenticated: boolean;
      reconnectAttempt: number;
    };
  }>([
    [
      'persona-a',
      {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (): void => undefined,
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: true,
          authenticated: true,
          reconnectAttempt: 0,
        }),
      },
    ],
  ]);

  const config = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'localhost',
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    relayClientsByPersonaId,
  });
  relayClientMapIsPreserved = config.relayClientsByPersonaId === relayClientsByPersonaId;
  localhostAddressValid = isEmailAddress({
    value: 'persona@localhost',
  });

  const persona = createPersona({});
  reconcilePersonaMailboxDomains({
    mailDomain: 'mail.protege.bot',
  });
  relayDomainReconciled = readPersonaMetadata({
    personaId: persona.personaId,
  }).emailAddress.endsWith('@mail.protege.bot');
});

describe('gateway inbound config relay wiring', () => {
  it('preserves provided relay client maps for runtime action fallback handling', () => {
    expect(relayClientMapIsPreserved).toBe(true);
  });

  it('accepts localhost-domain sender identities for local runtime flows', () => {
    expect(localhostAddressValid).toBe(true);
  });

  it('reconciles persona mailbox domains to configured relay mail domain', () => {
    expect(relayDomainReconciled).toBe(true);
  });
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});
