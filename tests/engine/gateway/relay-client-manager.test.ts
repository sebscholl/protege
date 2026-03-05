import type { PersonaRoots } from '@engine/shared/personas';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  readPersonaPassportKeyPem,
  startGatewayRelayClients,
} from '@engine/gateway/index';
import { createPersona } from '@engine/shared/personas';
import {
  createRelaySmtpChunkFrame,
  createRelaySmtpEndFrame,
  createRelaySmtpStartFrame,
} from '@relay/src/tunnel';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let roots: PersonaRoots;
let relayDisabledClientCount = 0;
let relayEnabledClientCount = 0;
let startedPublicKeys: string[] = [];
let passportKeyHasPemHeader = false;
let relayedMimeCount = 0;
let relayedRecipientAddress = '';
let relayedMailFrom = '';
let relayedPayload = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-relay-client-manager-',
  });
  roots = {
    personasDirPath: join(workspace.tempRootPath, 'personas'),
    memoryDirPath: join(workspace.tempRootPath, 'memory'),
  };

  const personaA = createPersona({
    roots,
  });
  createPersona({
    roots,
  });
  startedPublicKeys = [];

  relayDisabledClientCount = startGatewayRelayClients({
    relayConfig: {
      enabled: false,
      relayWsUrl: 'ws://relay.local/ws',
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1_000,
      heartbeatTimeoutMs: 10_000,
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    startClient: (args) => {
      startedPublicKeys.push(args.config.publicKeyBase32);
      return {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (): void => undefined,
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: false,
          authenticated: false,
          reconnectAttempt: 0,
        }),
      };
    },
  }).size;

  relayEnabledClientCount = startGatewayRelayClients({
    relayConfig: {
      enabled: true,
      relayWsUrl: 'ws://relay.local/ws',
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1_000,
      heartbeatTimeoutMs: 10_000,
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    onRelayInboundMime: (args): void => {
      relayedMimeCount += 1;
      relayedRecipientAddress = args.recipientAddress;
      relayedMailFrom = args.mailFrom;
      relayedPayload = args.rawMimeBuffer.toString('utf8');
    },
    startClient: (args) => {
      startedPublicKeys.push(args.config.publicKeyBase32);
      args.callbacks?.onBinaryMessage?.({
        payload: createRelaySmtpStartFrame({
          streamId: `stream-${args.config.publicKeyBase32}`,
          mailFrom: 'sender@example.com',
          rcptTo: `${args.config.publicKeyBase32}@relay-protege-mail.com`,
        }),
      });
      args.callbacks?.onBinaryMessage?.({
        payload: createRelaySmtpChunkFrame({
          streamId: `stream-${args.config.publicKeyBase32}`,
          chunk: Buffer.from('hello from relay', 'utf8'),
        }),
      });
      args.callbacks?.onBinaryMessage?.({
        payload: createRelaySmtpEndFrame({
          streamId: `stream-${args.config.publicKeyBase32}`,
        }),
      });
      return {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (): void => undefined,
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: false,
          authenticated: false,
          reconnectAttempt: 0,
        }),
      };
    },
  }).size;

  const passportKeyPem = readPersonaPassportKeyPem({
    personaId: personaA.personaId,
  });
  passportKeyHasPemHeader = passportKeyPem.includes('BEGIN PRIVATE KEY');
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway relay client manager', () => {
  it('starts no relay clients when relay mode is disabled', () => {
    expect(relayDisabledClientCount).toBe(0);
  });

  it('starts one relay client per persona when relay mode is enabled', () => {
    expect(relayEnabledClientCount).toBe(2);
  });

  it('passes persona public-key identities into relay client startup config', () => {
    expect(startedPublicKeys.length).toBe(2);
  });

  it('assembles tunneled relay smtp frames and emits completed mime payloads', () => {
    expect(relayedMimeCount).toBe(2);
  });

  it('emits tunneled relay mime metadata for recipient and sender addresses', () => {
    expect([relayedRecipientAddress.length > 0, relayedMailFrom]).toEqual([true, 'sender@example.com']);
  });

  it('emits concatenated tunneled relay mime payload bytes', () => {
    expect(relayedPayload).toBe('hello from relay');
  });

  it('reads persona passport key material from persona config namespace', () => {
    expect(passportKeyHasPemHeader).toBe(true);
  });
});
