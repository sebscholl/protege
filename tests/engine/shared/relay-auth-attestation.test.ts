import { generateKeyPairSync } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createRelayAuthAttestation,
  verifyRelayAuthAttestation,
} from '@engine/shared/relay-auth-attestation';

let privateKeyPem = '';
let publicKeyPem = '';
let verifiedPass = false;
let missingKeyRejected = false;
let tamperedSignatureRejected = false;
let contextMismatchRejected = false;

beforeAll((): void => {
  const keyPair = generateKeyPairSync('ed25519');
  privateKeyPem = keyPair.privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  }).toString();
  publicKeyPem = keyPair.publicKey.export({
    format: 'pem',
    type: 'spki',
  }).toString();

  const signed = createRelayAuthAttestation({
    keyId: 'relay-primary',
    privateKeyPem,
    payload: {
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@example.com',
      issuedAt: '2026-03-09T00:00:00.000Z',
      signals: {
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'pass',
      },
    },
  });

  verifiedPass = verifyRelayAuthAttestation({
    attestation: signed,
    trustedRelayPublicKeysByKeyId: new Map<string, string>([
      ['relay-primary', publicKeyPem],
    ]),
    expectedContext: {
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@example.com',
    },
  }).valid;

  missingKeyRejected = verifyRelayAuthAttestation({
    attestation: signed,
    trustedRelayPublicKeysByKeyId: new Map<string, string>(),
    expectedContext: {
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@example.com',
    },
  }).reason === 'missing_trusted_key';

  tamperedSignatureRejected = verifyRelayAuthAttestation({
    attestation: {
      ...signed,
      signatureBase64: signed.signatureBase64.slice(0, -4) + 'AAAA',
    },
    trustedRelayPublicKeysByKeyId: new Map<string, string>([
      ['relay-primary', publicKeyPem],
    ]),
    expectedContext: {
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@example.com',
    },
  }).reason === 'invalid_signature';

  contextMismatchRejected = verifyRelayAuthAttestation({
    attestation: signed,
    trustedRelayPublicKeysByKeyId: new Map<string, string>([
      ['relay-primary', publicKeyPem],
    ]),
    expectedContext: {
      streamId: 'stream-other',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@example.com',
    },
  }).reason === 'context_mismatch';
});

describe('relay auth attestation', () => {
  it('verifies signed relay attestation payloads with trusted relay keys', () => {
    expect(verifiedPass).toBe(true);
  });

  it('rejects attestations when relay key id is not trusted', () => {
    expect(missingKeyRejected).toBe(true);
  });

  it('rejects attestations with tampered signatures', () => {
    expect(tamperedSignatureRejected).toBe(true);
  });

  it('rejects attestations when frame context does not match signed payload', () => {
    expect(contextMismatchRejected).toBe(true);
  });
});
