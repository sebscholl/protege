import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { createRelayRateLimitState } from '@relay/src/rate-limit';
import { createRelaySessionRegistry, readRelaySessionByPublicKey } from '@relay/src/session-registry';
import { createRelayStore, readRelayChallenge } from '@relay/src/storage';
import {
  createRelayWsAuthState,
  handleRelayWsAuthControlMessage,
  parseRelayWsControlMessage,
} from '@relay/src/ws-auth';
import { toPublicKeyBase32 } from '@tests/helpers/relay-crypto';
import { createRelayAuthSocketDouble } from '@tests/helpers/relay-socket-doubles';

let parsedChallengeRequestType = '';
let parsedChallengeResponseType = '';
let invalidParsedMessageUndefined = false;

let issuedChallengeType = '';
let issuedChallengePublicKey = '';
let issuedChallengeId = '';
let issuedChallengeHasText = false;
let issuedStatePublicKey = '';
let issuedStateAuthenticated = true;
let issuedSocketClosedCode = -1;

let validAuthType = '';
let validAuthPublicKey = '';
let validAuthEmailLocalPart = '';
let validAuthReplacedSocketIdIsNull = false;
let validAuthStateAuthenticated = false;
let validAuthRegistryHasSession = false;

let invalidMessageType = '';
let invalidMessageCode = '';
let invalidMessageClosedCode = -1;
let invalidMessageClosedReason = '';

let invalidSignatureType = '';
let invalidSignatureCode = '';
let invalidSignatureClosedCode = -1;
let invalidSignatureClosedReason = '';
let invalidSignatureStateAuthenticated = true;

let replacementAuthType = '';
let replacementAuthSocketId = '';
let replacedSocketClosedCode = -1;
let replacedSocketClosedReason = '';
let replacementRegistrySocketId = '';
let rateLimitedAuthType = '';
let rateLimitedAuthCode = '';
let rateLimitedAuthClosedCode = -1;
let rateLimitedAuthClosedReason = '';
let authEventTypes: string[] = [];

beforeAll((): void => {
  parsedChallengeRequestType = parseRelayWsControlMessage({
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32: 'abc',
    }),
  })?.type ?? '';
  parsedChallengeResponseType = parseRelayWsControlMessage({
    messageJson: JSON.stringify({
      type: 'auth_challenge_response',
      publicKeyBase32: 'abc',
      challengeId: 'challenge-1',
      signatureBase64: 'sig',
    }),
  })?.type ?? '';
  invalidParsedMessageUndefined = parseRelayWsControlMessage({
    messageJson: '{"type":"missing_fields"}',
  }) === undefined;

  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyBase32 = toPublicKeyBase32({
    publicKey: keyPair.publicKey,
  });

  const issueStore = createRelayStore();
  const issueRegistry = createRelaySessionRegistry();
  const issueSocket = createRelayAuthSocketDouble({ socketId: 'socket-issue' });
  const issuedResult = handleRelayWsAuthControlMessage({
    store: issueStore,
    registry: issueRegistry,
    socket: issueSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32: publicKeyBase32.toUpperCase(),
    }),
    nowIso: '2026-02-14T00:00:00.000Z',
    onWsAuthEvent: (eventArgs): void => {
      authEventTypes.push(eventArgs.event);
    },
  });
  const issuedPayload = JSON.parse(issueSocket.capture.sentMessages[0] ?? '{}') as Record<string, unknown>;
  issuedChallengeType = String(issuedPayload.type ?? '');
  issuedChallengePublicKey = String(issuedPayload.publicKeyBase32 ?? '');
  issuedChallengeId = String(issuedPayload.challengeId ?? '');
  issuedChallengeHasText = typeof issuedPayload.challengeText === 'string';
  issuedStatePublicKey = issuedResult.state.publicKeyBase32 ?? '';
  issuedStateAuthenticated = issuedResult.state.authenticated;
  issuedSocketClosedCode = issueSocket.capture.closeCode;

  const validStore = createRelayStore();
  const validRegistry = createRelaySessionRegistry();
  const validSocket = createRelayAuthSocketDouble({ socketId: 'socket-valid' });
  const challengeResult = handleRelayWsAuthControlMessage({
    store: validStore,
    registry: validRegistry,
    socket: validSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:01:00.000Z',
  });
  const challengePayload = JSON.parse(validSocket.capture.sentMessages[0] ?? '{}') as Record<string, unknown>;
  const challengeId = String(challengePayload.challengeId ?? '');
  const challengeText = readRelayChallenge({
    store: validStore,
    challengeId,
  })?.challengeText ?? '';
  const signatureBase64 = sign(
    null,
    Buffer.from(challengeText, 'utf8'),
    keyPair.privateKey,
  ).toString('base64');
  const authResult = handleRelayWsAuthControlMessage({
    store: validStore,
    registry: validRegistry,
    socket: validSocket.socket,
    state: challengeResult.state,
    messageJson: JSON.stringify({
      type: 'auth_challenge_response',
      publicKeyBase32,
      challengeId,
      signatureBase64,
    }),
    nowIso: '2026-02-14T00:01:10.000Z',
    onWsAuthEvent: (eventArgs): void => {
      authEventTypes.push(eventArgs.event);
    },
  });
  const authPayload = JSON.parse(validSocket.capture.sentMessages[1] ?? '{}') as Record<string, unknown>;
  validAuthType = String(authPayload.type ?? '');
  validAuthPublicKey = String(authPayload.publicKeyBase32 ?? '');
  validAuthEmailLocalPart = String(authPayload.emailLocalPart ?? '');
  validAuthReplacedSocketIdIsNull = authPayload.replacedSocketId === null;
  validAuthStateAuthenticated = authResult.state.authenticated;
  validAuthRegistryHasSession = readRelaySessionByPublicKey({
    registry: validRegistry,
    publicKeyBase32,
  })?.socket.id === 'socket-valid';

  const invalidMessageStore = createRelayStore();
  const invalidMessageRegistry = createRelaySessionRegistry();
  const invalidMessageSocket = createRelayAuthSocketDouble({ socketId: 'socket-invalid-message' });
  handleRelayWsAuthControlMessage({
    store: invalidMessageStore,
    registry: invalidMessageRegistry,
    socket: invalidMessageSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: '{broken_json',
    nowIso: '2026-02-14T00:02:00.000Z',
  });
  const invalidMessagePayload = JSON.parse(
    invalidMessageSocket.capture.sentMessages[0] ?? '{}',
  ) as Record<string, unknown>;
  invalidMessageType = String(invalidMessagePayload.type ?? '');
  invalidMessageCode = String(invalidMessagePayload.code ?? '');
  invalidMessageClosedCode = invalidMessageSocket.capture.closeCode;
  invalidMessageClosedReason = invalidMessageSocket.capture.closeReason;

  const badSignatureStore = createRelayStore();
  const badSignatureRegistry = createRelaySessionRegistry();
  const badSignatureSocket = createRelayAuthSocketDouble({ socketId: 'socket-bad-signature' });
  const badSignatureChallengeResult = handleRelayWsAuthControlMessage({
    store: badSignatureStore,
    registry: badSignatureRegistry,
    socket: badSignatureSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:03:00.000Z',
  });
  const badSignatureChallengePayload = JSON.parse(
    badSignatureSocket.capture.sentMessages[0] ?? '{}',
  ) as Record<string, unknown>;
  const badSignatureResponseResult = handleRelayWsAuthControlMessage({
    store: badSignatureStore,
    registry: badSignatureRegistry,
    socket: badSignatureSocket.socket,
    state: badSignatureChallengeResult.state,
    messageJson: JSON.stringify({
      type: 'auth_challenge_response',
      publicKeyBase32,
      challengeId: String(badSignatureChallengePayload.challengeId ?? ''),
      signatureBase64: Buffer.from('not-a-valid-signature', 'utf8').toString('base64'),
    }),
    nowIso: '2026-02-14T00:03:10.000Z',
    onWsAuthEvent: (eventArgs): void => {
      authEventTypes.push(eventArgs.event);
    },
  });
  const badSignaturePayload = JSON.parse(
    badSignatureSocket.capture.sentMessages[1] ?? '{}',
  ) as Record<string, unknown>;
  invalidSignatureType = String(badSignaturePayload.type ?? '');
  invalidSignatureCode = String(badSignaturePayload.code ?? '');
  invalidSignatureClosedCode = badSignatureSocket.capture.closeCode;
  invalidSignatureClosedReason = badSignatureSocket.capture.closeReason;
  invalidSignatureStateAuthenticated = badSignatureResponseResult.state.authenticated;

  const replacementStore = createRelayStore();
  const replacementRegistry = createRelaySessionRegistry();
  const replacementSocketA = createRelayAuthSocketDouble({ socketId: 'socket-replace-a' });
  const replacementSocketB = createRelayAuthSocketDouble({ socketId: 'socket-replace-b' });
  const replacementChallengeA = handleRelayWsAuthControlMessage({
    store: replacementStore,
    registry: replacementRegistry,
    socket: replacementSocketA.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:04:00.000Z',
  });
  const replacementChallengePayloadA = JSON.parse(
    replacementSocketA.capture.sentMessages[0] ?? '{}',
  ) as Record<string, unknown>;
  const challengeTextA = readRelayChallenge({
    store: replacementStore,
    challengeId: String(replacementChallengePayloadA.challengeId ?? ''),
  })?.challengeText ?? '';
  const signatureA = sign(
    null,
    Buffer.from(challengeTextA, 'utf8'),
    keyPair.privateKey,
  ).toString('base64');
  handleRelayWsAuthControlMessage({
    store: replacementStore,
    registry: replacementRegistry,
    socket: replacementSocketA.socket,
    state: replacementChallengeA.state,
    messageJson: JSON.stringify({
      type: 'auth_challenge_response',
      publicKeyBase32,
      challengeId: String(replacementChallengePayloadA.challengeId ?? ''),
      signatureBase64: signatureA,
    }),
    nowIso: '2026-02-14T00:04:10.000Z',
  });

  const replacementChallengeB = handleRelayWsAuthControlMessage({
    store: replacementStore,
    registry: replacementRegistry,
    socket: replacementSocketB.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:04:20.000Z',
  });
  const replacementChallengePayloadB = JSON.parse(
    replacementSocketB.capture.sentMessages[0] ?? '{}',
  ) as Record<string, unknown>;
  const challengeTextB = readRelayChallenge({
    store: replacementStore,
    challengeId: String(replacementChallengePayloadB.challengeId ?? ''),
  })?.challengeText ?? '';
  const signatureB = sign(
    null,
    Buffer.from(challengeTextB, 'utf8'),
    keyPair.privateKey,
  ).toString('base64');
  handleRelayWsAuthControlMessage({
    store: replacementStore,
    registry: replacementRegistry,
    socket: replacementSocketB.socket,
    state: replacementChallengeB.state,
    messageJson: JSON.stringify({
      type: 'auth_challenge_response',
      publicKeyBase32,
      challengeId: String(replacementChallengePayloadB.challengeId ?? ''),
      signatureBase64: signatureB,
    }),
    nowIso: '2026-02-14T00:04:30.000Z',
  });
  const replacementAuthPayload = JSON.parse(
    replacementSocketB.capture.sentMessages[1] ?? '{}',
  ) as Record<string, unknown>;
  replacementAuthType = String(replacementAuthPayload.type ?? '');
  replacementAuthSocketId = String(replacementAuthPayload.replacedSocketId ?? '');
  replacedSocketClosedCode = replacementSocketA.capture.closeCode;
  replacedSocketClosedReason = replacementSocketA.capture.closeReason;
  replacementRegistrySocketId = readRelaySessionByPublicKey({
    registry: replacementRegistry,
    publicKeyBase32,
  })?.socket.id ?? '';

  const rateLimitedStore = createRelayStore();
  const rateLimitedRegistry = createRelaySessionRegistry();
  const rateLimitedSocket = createRelayAuthSocketDouble({ socketId: 'socket-rate-limit' });
  const authRateLimitState = createRelayRateLimitState();
  handleRelayWsAuthControlMessage({
    store: rateLimitedStore,
    registry: rateLimitedRegistry,
    socket: rateLimitedSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:05:00.000Z',
    remoteAddress: '127.0.0.1',
    authRateLimit: {
      state: authRateLimitState,
      attemptsPerMinutePerIp: 1,
      denyWindowMs: 60000,
    },
    onWsAuthEvent: (eventArgs): void => {
      authEventTypes.push(eventArgs.event);
    },
  });
  handleRelayWsAuthControlMessage({
    store: rateLimitedStore,
    registry: rateLimitedRegistry,
    socket: rateLimitedSocket.socket,
    state: createRelayWsAuthState(),
    messageJson: JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32,
    }),
    nowIso: '2026-02-14T00:05:01.000Z',
    remoteAddress: '127.0.0.1',
    authRateLimit: {
      state: authRateLimitState,
      attemptsPerMinutePerIp: 1,
      denyWindowMs: 60000,
    },
    onWsAuthEvent: (eventArgs): void => {
      authEventTypes.push(eventArgs.event);
    },
  });
  const rateLimitedPayload = JSON.parse(
    rateLimitedSocket.capture.sentMessages[1] ?? '{}',
  ) as Record<string, unknown>;
  rateLimitedAuthType = String(rateLimitedPayload.type ?? '');
  rateLimitedAuthCode = String(rateLimitedPayload.code ?? '');
  rateLimitedAuthClosedCode = rateLimitedSocket.capture.closeCode;
  rateLimitedAuthClosedReason = rateLimitedSocket.capture.closeReason;
});

describe('relay websocket auth control parsing', () => {
  it('parses auth_challenge_request messages', () => {
    expect(parsedChallengeRequestType).toBe('auth_challenge_request');
  });

  it('parses auth_challenge_response messages', () => {
    expect(parsedChallengeResponseType).toBe('auth_challenge_response');
  });

  it('returns undefined for malformed or unsupported messages', () => {
    expect(invalidParsedMessageUndefined).toBe(true);
  });
});

describe('relay websocket auth flow', () => {
  it('emits auth_challenge for valid challenge requests', () => {
    expect(issuedChallengeType).toBe('auth_challenge');
  });

  it('normalizes challenge public key identity text to lowercase', () => {
    expect(issuedChallengePublicKey).toBe(issuedChallengePublicKey.toLowerCase());
  });

  it('includes challenge id in challenge responses', () => {
    expect(issuedChallengeId.length > 0).toBe(true);
  });

  it('includes challenge text in challenge responses', () => {
    expect(issuedChallengeHasText).toBe(true);
  });

  it('tracks requested public key in unauthenticated socket state', () => {
    expect(issuedStatePublicKey).toBe(issuedChallengePublicKey);
  });

  it('keeps socket state unauthenticated after challenge issue', () => {
    expect(issuedStateAuthenticated).toBe(false);
  });

  it('does not close socket when issuing challenges', () => {
    expect(issuedSocketClosedCode).toBe(-1);
  });

  it('emits auth_ok for valid challenge responses', () => {
    expect(validAuthType).toBe('auth_ok');
  });

  it('returns normalized public key in auth_ok payload', () => {
    expect(validAuthPublicKey).toBe(validAuthPublicKey.toLowerCase());
  });

  it('returns email local-part in auth_ok payload', () => {
    expect(validAuthEmailLocalPart.length > 0).toBe(true);
  });

  it('returns null replacedSocketId for first authenticated session', () => {
    expect(validAuthReplacedSocketIdIsNull).toBe(true);
  });

  it('marks socket state authenticated after successful auth response', () => {
    expect(validAuthStateAuthenticated).toBe(true);
  });

  it('registers authenticated socket in the session registry', () => {
    expect(validAuthRegistryHasSession).toBe(true);
  });

  it('emits auth_error for invalid control messages', () => {
    expect(invalidMessageType).toBe('auth_error');
  });

  it('emits invalid_message code for invalid control messages', () => {
    expect(invalidMessageCode).toBe('invalid_message');
  });

  it('closes invalid-message sockets with protocol error code', () => {
    expect(invalidMessageClosedCode).toBe(4401);
  });

  it('closes invalid-message sockets with protocol error reason', () => {
    expect(invalidMessageClosedReason).toBe('invalid_message');
  });

  it('emits auth_error for invalid signatures', () => {
    expect(invalidSignatureType).toBe('auth_error');
  });

  it('emits invalid_signature code for invalid signatures', () => {
    expect(invalidSignatureCode).toBe('invalid_signature');
  });

  it('closes invalid-signature sockets with protocol error code', () => {
    expect(invalidSignatureClosedCode).toBe(4401);
  });

  it('closes invalid-signature sockets with protocol error reason', () => {
    expect(invalidSignatureClosedReason).toBe('invalid_signature');
  });

  it('keeps socket state unauthenticated after invalid signatures', () => {
    expect(invalidSignatureStateAuthenticated).toBe(false);
  });

  it('returns auth_ok on replacement session authentication', () => {
    expect(replacementAuthType).toBe('auth_ok');
  });

  it('returns replaced socket id on replacement authentication', () => {
    expect(replacementAuthSocketId).toBe('socket-replace-a');
  });

  it('closes replaced authenticated sockets with replacement code', () => {
    expect(replacedSocketClosedCode).toBe(4400);
  });

  it('closes replaced authenticated sockets with replacement reason', () => {
    expect(replacedSocketClosedReason).toBe('replaced_by_new_session');
  });

  it('keeps newest authenticated socket bound in session registry', () => {
    expect(replacementRegistrySocketId).toBe('socket-replace-b');
  });

  it('emits auth_error when auth rate limit is exceeded', () => {
    expect(rateLimitedAuthType).toBe('auth_error');
  });

  it('emits rate_limited code when auth rate limit is exceeded', () => {
    expect(rateLimitedAuthCode).toBe('rate_limited');
  });

  it('closes sockets with 4408 when auth rate limit is exceeded', () => {
    expect(rateLimitedAuthClosedCode).toBe(4408);
  });

  it('closes sockets with rate_limited reason when auth rate limit is exceeded', () => {
    expect(rateLimitedAuthClosedReason).toBe('rate_limited');
  });

  it('emits auth lifecycle callback events for observability', () => {
    expect(authEventTypes.length > 0).toBe(true);
  });
});
