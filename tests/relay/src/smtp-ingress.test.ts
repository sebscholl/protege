import { beforeAll, describe, expect, it } from 'vitest';

import {
  resolveRelayRecipientPublicKeyBase32,
  routeInboundSmtpToRelaySession,
} from '@relay/src/smtp-ingress';
import { activateRelaySession, createRelaySessionRegistry } from '@relay/src/session-registry';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';

let parsedRecipientLocalPart = '';
let invalidRecipientUndefined = false;
let rejectedReasonInvalid = '';
let rejectedReasonMissingSession = '';
let rejectedMissingSessionPublicKey = '';
let streamWriteFailedReason = '';
let accepted = false;
let acceptedStreamId = '';
let sentFrameCount = 0;
let startFrameType = '';
let startFrameMailFrom = '';
let startFrameRcptTo = '';
let chunkOnePayload = '';
let chunkTwoPayload = '';
let endFrameType = '';

beforeAll((): void => {
  parsedRecipientLocalPart = resolveRelayRecipientPublicKeyBase32({
    recipientAddress: 'ABC123@relay-protege-mail.com',
  }) ?? '';
  invalidRecipientUndefined = resolveRelayRecipientPublicKeyBase32({
    recipientAddress: 'invalid-address',
  }) === undefined;

  const registry = createRelaySessionRegistry();
  rejectedReasonInvalid = routeInboundSmtpToRelaySession({
    registry,
    recipientAddress: 'invalid-address',
    mailFrom: 'sender@example.com',
    chunkBuffers: [],
  }).reason ?? '';

  const missingSessionResult = routeInboundSmtpToRelaySession({
    registry,
    recipientAddress: 'persona-a@relay-protege-mail.com',
    mailFrom: 'sender@example.com',
    chunkBuffers: [],
  });
  rejectedReasonMissingSession = missingSessionResult.reason ?? '';
  rejectedMissingSessionPublicKey = missingSessionResult.recipientPublicKeyBase32 ?? '';

  const sentFrames: Buffer[] = [];
  activateRelaySession({
    registry,
    publicKeyBase32: 'persona-a',
    socket: {
      id: 'socket-a',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          sentFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  const acceptedResult = routeInboundSmtpToRelaySession({
    registry,
    recipientAddress: 'persona-a@relay-protege-mail.com',
    mailFrom: 'sender@example.com',
    chunkBuffers: [
      Buffer.from('hello ', 'utf8'),
      Buffer.from('world', 'utf8'),
    ],
    streamId: 'stream-abc',
  });
  accepted = acceptedResult.accepted;
  acceptedStreamId = acceptedResult.streamId ?? '';
  sentFrameCount = sentFrames.length;

  const parsedStart = parseRelayTunnelFrame({
    payload: sentFrames[0],
  });
  const parsedChunkOne = parseRelayTunnelFrame({
    payload: sentFrames[1],
  });
  const parsedChunkTwo = parseRelayTunnelFrame({
    payload: sentFrames[2],
  });
  const parsedEnd = parseRelayTunnelFrame({
    payload: sentFrames[3],
  });

  startFrameType = parsedStart?.type ?? '';
  startFrameMailFrom = parsedStart && parsedStart.type === 'smtp_start' ? parsedStart.mailFrom : '';
  startFrameRcptTo = parsedStart && parsedStart.type === 'smtp_start' ? parsedStart.rcptTo : '';
  chunkOnePayload = parsedChunkOne && parsedChunkOne.type === 'smtp_chunk'
    ? parsedChunkOne.chunk.toString('utf8')
    : '';
  chunkTwoPayload = parsedChunkTwo && parsedChunkTwo.type === 'smtp_chunk'
    ? parsedChunkTwo.chunk.toString('utf8')
    : '';
  endFrameType = parsedEnd?.type ?? '';

  const failureRegistry = createRelaySessionRegistry();
  activateRelaySession({
    registry: failureRegistry,
    publicKeyBase32: 'persona-b',
    socket: {
      id: 'socket-b',
      send: (): void => {
        throw new Error('disconnected');
      },
      close: (): void => undefined,
    },
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  streamWriteFailedReason = routeInboundSmtpToRelaySession({
    registry: failureRegistry,
    recipientAddress: 'persona-b@relay-protege-mail.com',
    mailFrom: 'sender@example.com',
    chunkBuffers: [Buffer.from('hello', 'utf8')],
  }).reason ?? '';
});

describe('relay smtp ingress recipient resolution', () => {
  it('extracts lowercase recipient local-part identities', () => {
    expect(parsedRecipientLocalPart).toBe('abc123');
  });

  it('returns undefined for invalid recipient addresses', () => {
    expect(invalidRecipientUndefined).toBe(true);
  });
});

describe('relay smtp ingress routing', () => {
  it('rejects invalid recipient addresses', () => {
    expect(rejectedReasonInvalid).toBe('recipient_invalid');
  });

  it('rejects recipients without active authenticated sessions', () => {
    expect(rejectedReasonMissingSession).toBe('recipient_not_connected');
  });

  it('returns stream_write_failed when a relay socket disconnects mid-stream', () => {
    expect(streamWriteFailedReason).toBe('stream_write_failed');
  });

  it('reports missing-session recipient public keys', () => {
    expect(rejectedMissingSessionPublicKey).toBe('persona-a');
  });

  it('accepts inbound smtp when recipient session is connected', () => {
    expect(accepted).toBe(true);
  });

  it('keeps explicit stream ids during inbound smtp routing', () => {
    expect(acceptedStreamId).toBe('stream-abc');
  });

  it('sends start plus all chunks plus end relay frames', () => {
    expect(sentFrameCount).toBe(4);
  });

  it('sends smtp_start metadata with sender details', () => {
    expect(startFrameType).toBe('smtp_start');
  });

  it('sends smtp_start metadata with mailFrom and rcptTo values', () => {
    expect([startFrameMailFrom, startFrameRcptTo]).toEqual([
      'sender@example.com',
      'persona-a@relay-protege-mail.com',
    ]);
  });

  it('sends first smtp_chunk payload bytes', () => {
    expect(chunkOnePayload).toBe('hello ');
  });

  it('sends second smtp_chunk payload bytes', () => {
    expect(chunkTwoPayload).toBe('world');
  });

  it('sends smtp_end frame after all chunks', () => {
    expect(endFrameType).toBe('smtp_end');
  });
});
