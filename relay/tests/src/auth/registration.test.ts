import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { deriveRelayEmailLocalPart, issueRelayChallenge } from '@relay/src/auth/challenge';
import { verifyRelayChallengeResponse } from '@relay/src/auth/verify';
import { createRelayStore, readRelayChallenge } from '@relay/src/storage';
import { toPublicKeyBase32 } from '@tests/helpers/relay-crypto';

let validAccepted = false;
let validEmailLocalPart = '';
let invalidSignatureCode = '';
let expiredCode = '';
let replayCode = '';
let mismatchCode = '';
let unknownChallengeCode = '';
let invalidEncodingCode = '';
let duplicateCreatedAtStable = false;
let duplicateLastSeenAdvanced = false;
let derivedLocalPartLowercase = '';
let challengeUsedAfterSuccess = false;
let challengeCapEvictedOldest = false;

beforeAll((): void => {
  const keyPairA = generateKeyPairSync('ed25519');
  const keyPairB = generateKeyPairSync('ed25519');
  const publicKeyA = toPublicKeyBase32({
    publicKey: keyPairA.publicKey,
  });
  const publicKeyB = toPublicKeyBase32({
    publicKey: keyPairB.publicKey,
  });
  derivedLocalPartLowercase = deriveRelayEmailLocalPart({
    publicKeyBase32: publicKeyA.toUpperCase(),
  });

  const store = createRelayStore();
  const challenge = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:00:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-1',
  });
  const signature = sign(
    null,
    Buffer.from(challenge.challengeText, 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  const validResult = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: challenge.challengeId,
    signatureBase64: signature,
    nowIso: '2026-02-14T00:00:10.000Z',
  });
  validAccepted = validResult.accepted;
  validEmailLocalPart = validResult.identity?.emailLocalPart ?? '';
  challengeUsedAfterSuccess = Boolean(readRelayChallenge({
    store,
    challengeId: challenge.challengeId,
  })?.usedAt);

  const invalidSignatureChallenge = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:01:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-invalid-signature',
  });
  const invalidSignature = sign(
    null,
    Buffer.from('wrong-text', 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  invalidSignatureCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: invalidSignatureChallenge.challengeId,
    signatureBase64: invalidSignature,
    nowIso: '2026-02-14T00:01:10.000Z',
  }).errorCode ?? '';

  const expiredChallenge = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:02:00.000Z',
    ttlSeconds: 1,
    challengeId: 'challenge-expired',
  });
  const expiredSignature = sign(
    null,
    Buffer.from(expiredChallenge.challengeText, 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  expiredCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: expiredChallenge.challengeId,
    signatureBase64: expiredSignature,
    nowIso: '2026-02-14T00:02:05.000Z',
  }).errorCode ?? '';

  replayCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: challenge.challengeId,
    signatureBase64: signature,
    nowIso: '2026-02-14T00:00:20.000Z',
  }).errorCode ?? '';

  const mismatchChallenge = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:04:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-mismatch',
  });
  const mismatchSignature = sign(
    null,
    Buffer.from(mismatchChallenge.challengeText, 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  mismatchCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyB,
    challengeId: mismatchChallenge.challengeId,
    signatureBase64: mismatchSignature,
    nowIso: '2026-02-14T00:04:10.000Z',
  }).errorCode ?? '';

  unknownChallengeCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: 'missing-challenge',
    signatureBase64: signature,
    nowIso: '2026-02-14T00:05:00.000Z',
  }).errorCode ?? '';

  const invalidEncodingChallenge = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:06:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-invalid-encoding',
  });
  invalidEncodingCode = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: invalidEncodingChallenge.challengeId,
    signatureBase64: '',
    nowIso: '2026-02-14T00:06:10.000Z',
  }).errorCode ?? '';

  const duplicateChallengeA = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:07:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-duplicate-a',
  });
  const duplicateSignatureA = sign(
    null,
    Buffer.from(duplicateChallengeA.challengeText, 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  const firstDuplicate = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: duplicateChallengeA.challengeId,
    signatureBase64: duplicateSignatureA,
    nowIso: '2026-02-14T00:07:10.000Z',
  });

  const duplicateChallengeB = issueRelayChallenge({
    store,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:08:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-duplicate-b',
  });
  const duplicateSignatureB = sign(
    null,
    Buffer.from(duplicateChallengeB.challengeText, 'utf8'),
    keyPairA.privateKey,
  ).toString('base64');
  const secondDuplicate = verifyRelayChallengeResponse({
    store,
    publicKeyBase32: publicKeyA,
    challengeId: duplicateChallengeB.challengeId,
    signatureBase64: duplicateSignatureB,
    nowIso: '2026-02-14T00:08:10.000Z',
  });
  duplicateCreatedAtStable = firstDuplicate.identity?.createdAt === secondDuplicate.identity?.createdAt;
  duplicateLastSeenAdvanced = (secondDuplicate.identity?.lastSeenAt ?? '') > (firstDuplicate.identity?.lastSeenAt ?? '');

  const cappedStore = createRelayStore();
  issueRelayChallenge({
    store: cappedStore,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:09:00.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-cap-1',
    maxChallengeRecords: 2,
  });
  issueRelayChallenge({
    store: cappedStore,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:09:01.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-cap-2',
    maxChallengeRecords: 2,
  });
  issueRelayChallenge({
    store: cappedStore,
    publicKeyBase32: publicKeyA,
    nowIso: '2026-02-14T00:09:02.000Z',
    ttlSeconds: 60,
    challengeId: 'challenge-cap-3',
    maxChallengeRecords: 2,
  });
  challengeCapEvictedOldest = readRelayChallenge({
    store: cappedStore,
    challengeId: 'challenge-cap-1',
  }) === undefined;
});

describe('relay auth registration flow', () => {
  it('accepts valid ed25519 challenge signatures', () => {
    expect(validAccepted).toBe(true);
  });

  it('derives stable lowercase email local-part from public key identity', () => {
    expect(validEmailLocalPart).toBe(derivedLocalPartLowercase);
  });

  it('marks successful challenges as used to prevent replay', () => {
    expect(challengeUsedAfterSuccess).toBe(true);
  });

  it('rejects invalid signatures', () => {
    expect(invalidSignatureCode).toBe('invalid_signature');
  });

  it('rejects expired challenges', () => {
    expect(expiredCode).toBe('challenge_expired');
  });

  it('rejects replay attempts on used challenges', () => {
    expect(replayCode).toBe('challenge_already_used');
  });

  it('rejects challenge responses with mismatched public keys', () => {
    expect(mismatchCode).toBe('challenge_mismatch');
  });

  it('rejects unknown challenge ids', () => {
    expect(unknownChallengeCode).toBe('challenge_not_found');
  });

  it('rejects invalid signature encodings', () => {
    expect(invalidEncodingCode).toBe('invalid_signature_encoding');
  });

  it('keeps identity createdAt stable across repeated valid registrations', () => {
    expect(duplicateCreatedAtStable).toBe(true);
  });

  it('updates identity lastSeenAt across repeated valid registrations', () => {
    expect(duplicateLastSeenAdvanced).toBe(true);
  });

  it('evicts oldest challenge records when challenge cap is exceeded', () => {
    expect(challengeCapEvictedOldest).toBe(true);
  });
});
