import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { createRelaySessionRegistry, readRelaySessionByPublicKey } from '@relay/src/session-registry';
import { createRelayStore, readRelayChallenge } from '@relay/src/storage';
import { createRelaySmtpChunkFrame } from '@relay/src/tunnel';
import { attachRelayWsConnection, toRelayWsMessageJson } from '@relay/src/ws-connection';
import { toPublicKeyBase32 } from '@tests/helpers/relay-crypto';
import { createRelayWsSocketDouble } from '@tests/helpers/relay-socket-doubles';

let jsonFromString = '';
let jsonFromBuffer = '';
let jsonFromArrayBuffer = '';
let jsonFromBufferChunks = '';
let jsonFromUnsupportedIsUndefined = false;

let invalidMessageErrorType = '';
let invalidMessageErrorCode = '';
let invalidMessageCloseCode = -1;
let invalidMessageCloseReason = '';

let validAuthType = '';
let validSessionSocketId = '';
let sessionRemovedOnClose = false;
let outboundTunnelFrameType = '';
let outboundTunnelFrameStreamId = '';
let outboundTunnelPayload = '';
let invalidTunnelFrameCode = '';
let invalidTunnelFrameCloseCode = -1;
let invalidTunnelFrameCloseReason = '';

beforeAll((): void => {
  jsonFromString = toRelayWsMessageJson({
    payload: '{"ok":true}',
  }) ?? '';
  jsonFromBuffer = toRelayWsMessageJson({
    payload: Buffer.from('{"ok":true}', 'utf8'),
  }) ?? '';
  jsonFromArrayBuffer = toRelayWsMessageJson({
    payload: Buffer.from('{"ok":true}', 'utf8').buffer,
  }) ?? '';
  jsonFromBufferChunks = toRelayWsMessageJson({
    payload: [
      Buffer.from('{"ok"', 'utf8'),
      Buffer.from(':true}', 'utf8'),
    ],
  }) ?? '';
  jsonFromUnsupportedIsUndefined = toRelayWsMessageJson({
    payload: 123,
  }) === undefined;

  const invalidRuntime = {
    store: createRelayStore(),
    registry: createRelaySessionRegistry(),
  };
  const invalidSocket = createRelayWsSocketDouble();
  attachRelayWsConnection({
    ws: invalidSocket.ws,
    runtime: invalidRuntime,
    nowIso: (): string => '2026-02-14T00:00:00.000Z',
    socketId: 'socket-invalid',
  });
  invalidSocket.emitMessage(123);
  const invalidErrorPayload = JSON.parse(
    String(invalidSocket.sent[0] ?? '{}'),
  ) as Record<string, unknown>;
  invalidMessageErrorType = String(invalidErrorPayload.type ?? '');
  invalidMessageErrorCode = String(invalidErrorPayload.code ?? '');
  invalidMessageCloseCode = invalidSocket.closedCode;
  invalidMessageCloseReason = invalidSocket.closedReason;

  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyBase32 = toPublicKeyBase32({
    publicKey: keyPair.publicKey,
  });
  const runtime = {
    store: createRelayStore(),
    registry: createRelaySessionRegistry(),
    onOutboundTunnelFrame: (
      args: {
        frame: {
          type: string;
          streamId: string;
          chunk?: Buffer;
        };
      },
    ): void => {
      outboundTunnelFrameType = args.frame.type;
      outboundTunnelFrameStreamId = args.frame.streamId;
      outboundTunnelPayload = args.frame.chunk?.toString('utf8') ?? '';
    },
  };
  const socket = createRelayWsSocketDouble();
  attachRelayWsConnection({
    ws: socket.ws,
    runtime,
    nowIso: (): string => '2026-02-14T00:01:00.000Z',
    socketId: 'socket-valid',
  });
  socket.emitMessage(JSON.stringify({
    type: 'auth_challenge_request',
    publicKeyBase32,
  }));
  const challengePayload = JSON.parse(
    String(socket.sent[0] ?? '{}'),
  ) as Record<string, unknown>;
  const challengeId = String(challengePayload.challengeId ?? '');
  const challengeText = readRelayChallenge({
    store: runtime.store,
    challengeId,
  })?.challengeText ?? '';
  const signatureBase64 = sign(
    null,
    Buffer.from(challengeText, 'utf8'),
    keyPair.privateKey,
  ).toString('base64');
  socket.emitMessage(Buffer.from(JSON.stringify({
    type: 'auth_challenge_response',
    publicKeyBase32,
    challengeId,
    signatureBase64,
  }), 'utf8'));
  const authPayload = JSON.parse(
    String(socket.sent[1] ?? '{}'),
  ) as Record<string, unknown>;
  validAuthType = String(authPayload.type ?? '');
  validSessionSocketId = readRelaySessionByPublicKey({
    registry: runtime.registry,
    publicKeyBase32,
  })?.socket.id ?? '';

  socket.emitMessage(createRelaySmtpChunkFrame({
    streamId: 'stream-1',
    chunk: Buffer.from('outbound test', 'utf8'),
  }));

  const invalidTunnelSocket = createRelayWsSocketDouble();
  const invalidTunnelStore = createRelayStore();
  const invalidTunnelRegistry = createRelaySessionRegistry();
  attachRelayWsConnection({
    ws: invalidTunnelSocket.ws,
    runtime: {
      store: invalidTunnelStore,
      registry: invalidTunnelRegistry,
    },
    nowIso: (): string => '2026-02-14T00:02:00.000Z',
    socketId: 'socket-invalid-tunnel',
  });
  const invalidTunnelPair = generateKeyPairSync('ed25519');
  const invalidTunnelPublicKey = toPublicKeyBase32({
    publicKey: invalidTunnelPair.publicKey,
  });
  invalidTunnelSocket.emitMessage(JSON.stringify({
    type: 'auth_challenge_request',
    publicKeyBase32: invalidTunnelPublicKey,
  }));
  const invalidTunnelChallengePayload = JSON.parse(
    String(invalidTunnelSocket.sent[0] ?? '{}'),
  ) as Record<string, unknown>;
  const invalidTunnelChallenge = readRelayChallenge({
    store: invalidTunnelStore,
    challengeId: String(invalidTunnelChallengePayload.challengeId ?? ''),
  });
  const invalidChallengeId = String(invalidTunnelChallengePayload.challengeId ?? '');
  const invalidChallengeText = invalidTunnelChallenge?.challengeText ?? '';
  const invalidTunnelSignatureBase64 = sign(
    null,
    Buffer.from(invalidChallengeText, 'utf8'),
    invalidTunnelPair.privateKey,
  ).toString('base64');
  invalidTunnelSocket.emitMessage(JSON.stringify({
    type: 'auth_challenge_response',
    publicKeyBase32: invalidTunnelPublicKey,
    challengeId: invalidChallengeId,
    signatureBase64: invalidTunnelSignatureBase64,
  }));
  invalidTunnelSocket.emitMessage(Buffer.from([1, 2, 3]));
  const invalidTunnelPayloadJson = JSON.parse(
    String(invalidTunnelSocket.sent[2] ?? '{}'),
  ) as Record<string, unknown>;
  invalidTunnelFrameCode = String(invalidTunnelPayloadJson.code ?? '');
  invalidTunnelFrameCloseCode = invalidTunnelSocket.closedCode;
  invalidTunnelFrameCloseReason = invalidTunnelSocket.closedReason;
  socket.emitClose();
  sessionRemovedOnClose = readRelaySessionByPublicKey({
    registry: runtime.registry,
    publicKeyBase32,
  }) === undefined;
});

describe('relay websocket payload normalization', () => {
  it('keeps string websocket payloads unchanged', () => {
    expect(jsonFromString).toBe('{"ok":true}');
  });

  it('decodes buffer websocket payloads as utf8 text', () => {
    expect(jsonFromBuffer).toBe('{"ok":true}');
  });

  it('decodes arraybuffer websocket payloads as utf8 text', () => {
    expect(jsonFromArrayBuffer.includes('{"ok":true}')).toBe(true);
  });

  it('decodes fragmented buffer payload arrays as utf8 text', () => {
    expect(jsonFromBufferChunks).toBe('{"ok":true}');
  });

  it('returns undefined for unsupported payload formats', () => {
    expect(jsonFromUnsupportedIsUndefined).toBe(true);
  });
});

describe('relay websocket connection handling', () => {
  it('emits auth_error on unsupported websocket payload format', () => {
    expect(invalidMessageErrorType).toBe('auth_error');
  });

  it('emits invalid_message code on unsupported websocket payload format', () => {
    expect(invalidMessageErrorCode).toBe('invalid_message');
  });

  it('closes websocket connections on unsupported payload formats', () => {
    expect(invalidMessageCloseCode).toBe(4401);
  });

  it('closes websocket connections with invalid_message reason on unsupported payload formats', () => {
    expect(invalidMessageCloseReason).toBe('invalid_message');
  });

  it('authenticates valid challenge-response traffic through websocket connection listeners', () => {
    expect(validAuthType).toBe('auth_ok');
  });

  it('stores authenticated websocket sessions in relay runtime registry', () => {
    expect(validSessionSocketId).toBe('socket-valid');
  });

  it('routes authenticated binary tunnel frames to outbound tunnel handler callbacks', () => {
    expect([outboundTunnelFrameType, outboundTunnelFrameStreamId, outboundTunnelPayload]).toEqual([
      'smtp_chunk',
      'stream-1',
      'outbound test',
    ]);
  });

  it('returns invalid_tunnel_frame error code for malformed authenticated binary frames', () => {
    expect(invalidTunnelFrameCode).toBe('invalid_tunnel_frame');
  });

  it('closes malformed authenticated binary frame sockets with tunnel error code', () => {
    expect(invalidTunnelFrameCloseCode).toBe(4401);
  });

  it('closes malformed authenticated binary frame sockets with tunnel error reason', () => {
    expect(invalidTunnelFrameCloseReason).toBe('invalid_tunnel_frame');
  });

  it('removes websocket sessions from registry on close', () => {
    expect(sessionRemovedOnClose).toBe(true);
  });
});
