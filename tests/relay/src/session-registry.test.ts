import { beforeAll, describe, expect, it } from 'vitest';

import {
  activateRelaySession,
  createRelaySessionRegistry,
  readRelaySessionByPublicKey,
  removeRelaySessionBySocketId,
} from '@relay/src/session-registry';

let createdSessionMatchesSocket = false;
let createdReverseIndexMatchesPublicKey = false;
let replacementSocketId = '';
let replacedSocketClosedCode = -1;
let replacedSocketClosedReason = '';
let latestSocketStoredAfterReplacement = false;
let outboundSessionAddedWithoutReplacingInbound = false;
let outboundSessionRemovedBySocketId = false;
let removedSessionMissing = false;
let removedReverseIndexMissing = false;
let missingSessionReadIsUndefined = false;

beforeAll((): void => {
  const registry = createRelaySessionRegistry();
  const replacedCloseState = {
    code: -1,
    reason: '',
  };
  const socketA = {
    id: 'socket-a',
    send: (): void => undefined,
    close: (
      code: number,
      reason: string,
    ): void => {
      replacedCloseState.code = code;
      replacedCloseState.reason = reason;
    },
  };
  activateRelaySession({
    registry,
    publicKeyBase32: 'persona-alpha',
    socket: socketA,
    sessionRole: 'inbound',
    nowIso: '2026-02-14T00:00:00.000Z',
  });

  createdSessionMatchesSocket = readRelaySessionByPublicKey({
    registry,
    publicKeyBase32: 'persona-alpha',
  })?.socket.id === 'socket-a';
  createdReverseIndexMatchesPublicKey = registry.sessionIdentityBySocketId.get('socket-a')?.publicKeyBase32 === 'persona-alpha';

  const socketB = {
    id: 'socket-b',
    send: (): void => undefined,
    close: (): void => undefined,
  };
  const replacement = activateRelaySession({
    registry,
    publicKeyBase32: 'persona-alpha',
    socket: socketB,
    sessionRole: 'inbound',
    nowIso: '2026-02-14T00:00:01.000Z',
  });
  replacementSocketId = replacement.replacedSocketId ?? '';
  replacedSocketClosedCode = replacedCloseState.code;
  replacedSocketClosedReason = replacedCloseState.reason;
  latestSocketStoredAfterReplacement = readRelaySessionByPublicKey({
    registry,
    publicKeyBase32: 'persona-alpha',
  })?.socket.id === 'socket-b';

  const socketC = {
    id: 'socket-c',
    send: (): void => undefined,
    close: (): void => undefined,
  };
  activateRelaySession({
    registry,
    publicKeyBase32: 'persona-alpha',
    socket: socketC,
    sessionRole: 'outbound',
    nowIso: '2026-02-14T00:00:02.000Z',
  });
  outboundSessionAddedWithoutReplacingInbound = readRelaySessionByPublicKey({
    registry,
    publicKeyBase32: 'persona-alpha',
  })?.socket.id === 'socket-b' && registry.outboundSessionsByPublicKey.get('persona-alpha')?.size === 1;

  removeRelaySessionBySocketId({
    registry,
    socketId: 'socket-c',
  });
  outboundSessionRemovedBySocketId = registry.outboundSessionsByPublicKey.has('persona-alpha') === false;

  removeRelaySessionBySocketId({
    registry,
    socketId: 'socket-b',
  });
  removedSessionMissing = readRelaySessionByPublicKey({
    registry,
    publicKeyBase32: 'persona-alpha',
  }) === undefined;
  removedReverseIndexMissing = registry.sessionIdentityBySocketId.has('socket-b') === false;

  missingSessionReadIsUndefined = readRelaySessionByPublicKey({
    registry,
    publicKeyBase32: 'persona-missing',
  }) === undefined;
});

describe('relay session registry', () => {
  it('stores sessions by public key when activated', () => {
    expect(createdSessionMatchesSocket).toBe(true);
  });

  it('stores reverse socket-to-public-key index when activated', () => {
    expect(createdReverseIndexMatchesPublicKey).toBe(true);
  });

  it('returns replaced socket id when replacing an existing public-key session', () => {
    expect(replacementSocketId).toBe('socket-a');
  });

  it('closes replaced sockets with deterministic replacement close code', () => {
    expect(replacedSocketClosedCode).toBe(4400);
  });

  it('closes replaced sockets with deterministic replacement reason', () => {
    expect(replacedSocketClosedReason).toBe('replaced_by_new_session');
  });

  it('keeps the newest socket attached to the public-key session', () => {
    expect(latestSocketStoredAfterReplacement).toBe(true);
  });

  it('adds outbound sessions without replacing inbound routing session', () => {
    expect(outboundSessionAddedWithoutReplacingInbound).toBe(true);
  });

  it('removes outbound sessions by socket id', () => {
    expect(outboundSessionRemovedBySocketId).toBe(true);
  });

  it('removes session records by socket id', () => {
    expect(removedSessionMissing).toBe(true);
  });

  it('removes reverse index records by socket id', () => {
    expect(removedReverseIndexMissing).toBe(true);
  });

  it('returns undefined for unknown public keys', () => {
    expect(missingSessionReadIsUndefined).toBe(true);
  });
});
