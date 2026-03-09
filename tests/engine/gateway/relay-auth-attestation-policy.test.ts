import type { SMTPServerSession } from 'smtp-server';

import { generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayInboundProcessingConfig } from '@engine/gateway/index';
import { createUnifiedLogger } from '@engine/shared/logger';
import { createRelayAuthAttestation } from '@engine/shared/relay-auth-attestation';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let relayAttestationAccepted = false;
let relayAttestationRejected = false;
let relayMissingAttestationRejected = false;

/**
 * Creates one minimal SMTP envelope session for relay-ingested auth-policy checks.
 */
function createRelaySession(): SMTPServerSession {
  return {
    id: 'relay-stream-1',
    envelope: {
      mailFrom: {
        address: 'sender@example.com',
        args: false,
      },
      rcptTo: [
        {
          address: 'persona@mail.protege.bot',
          args: false,
        },
      ],
    },
  } as unknown as SMTPServerSession;
}

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-relay-auth-policy-',
    chdir: false,
  });
  const logsDirPath = join(workspace.tempRootPath, 'logs');
  const logger = createUnifiedLogger({
    logsDirPath,
    scope: 'gateway',
    emitToConsole: false,
  });
  const keyPair = generateKeyPairSync('ed25519');
  const privateKeyPem = keyPair.privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  }).toString();
  const publicKeyPem = keyPair.publicKey.export({
    format: 'pem',
    type: 'spki',
  }).toString();

  const inboundConfig = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'mail.protege.bot',
    },
    securityConfig: {
      gatewayAccess: {
        enabled: false,
        defaultDecision: 'allow',
        allow: [],
        deny: [],
      },
      gatewayAuth: {
        enabled: true,
        mode: 'enforce',
        policy: 'require_dmarc_or_aligned_spf_dkim',
        trustedRelays: [
          {
            keyId: 'relay-primary',
            publicKeyPem,
          },
        ],
      },
    },
    logger,
  });

  const signed = createRelayAuthAttestation({
    keyId: 'relay-primary',
    privateKeyPem,
    payload: {
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@mail.protege.bot',
      issuedAt: '2026-03-09T00:00:00.000Z',
      signals: {
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'fail',
      },
    },
  });

  relayAttestationAccepted = inboundConfig.evaluateSenderAuth({
    senderAddress: 'sender@example.com',
    session: createRelaySession(),
    personaId: 'persona-1',
    relayStreamId: 'stream-1',
    authenticationResultsHeader: undefined,
    relayAuthAttestation: signed,
  }).allowed;

  relayAttestationRejected = inboundConfig.evaluateSenderAuth({
    senderAddress: 'sender@example.com',
    session: createRelaySession(),
    personaId: 'persona-1',
    relayStreamId: 'stream-1',
    authenticationResultsHeader: undefined,
    relayAuthAttestation: {
      ...signed,
      signatureBase64: signed.signatureBase64.slice(0, -4) + 'AAAA',
    },
  }).allowed === false;

  relayMissingAttestationRejected = inboundConfig.evaluateSenderAuth({
    senderAddress: 'sender@example.com',
    session: createRelaySession(),
    personaId: 'persona-1',
    relayStreamId: 'stream-1',
    authenticationResultsHeader: 'mx.example; spf=pass smtp.mailfrom=sender.example; dkim=pass header.d=sender.example; dmarc=pass',
    relayAuthAttestation: undefined,
  }).allowed === false;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway relay auth attestation policy', () => {
  it('allows enforce-mode inbound messages when trusted relay attestation carries pass auth signals', () => {
    expect(relayAttestationAccepted).toBe(true);
  });

  it('rejects enforce-mode inbound messages when relay attestation signature is invalid', () => {
    expect(relayAttestationRejected).toBe(true);
  });

  it('rejects enforce-mode relay ingress without attestation even if Authentication-Results header is present', () => {
    expect(relayMissingAttestationRejected).toBe(true);
  });
});
