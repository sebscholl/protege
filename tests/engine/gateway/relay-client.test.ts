import { generateKeyPairSync, verify } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  resolveReconnectDelayMs,
  startRelayClient,
} from '@engine/gateway/relay-client';
import { waitForCondition } from '@tests/helpers/async';

type ScheduledTimer = {
  id: ReturnType<typeof setTimeout>;
  delayMs: number;
  handler: () => void;
};

type ManualSocket = {
  sent: Array<string | Buffer>;
  closed: Array<{ code?: number; reason?: string }>;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: (() => void) | null;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  emitOpen(): void;
  emitTextMessage(data: string): void;
  emitBinaryMessage(data: Buffer): void;
  emitBlobMessage(data: Blob): void;
  emitClose(code?: number, reason?: string): void;
};

let reconnectDelayAttemptOne = 0;
let reconnectDelayAttemptTwo = 0;
let reconnectDelayCapped = 0;
let preAuthSendThrows = false;
let authSignatureVerified = false;
let authenticatedAfterAuthOk = false;
let reconnectSocketCreated = false;
let reconnectDelayCaptured = 0;
let authenticatedIdleCloseCode = 0;
let unauthenticatedHandshakeTimeoutCloseCode = 0;
let binaryDeliveredAfterAuth = false;
let binaryIgnoredBeforeAuth = true;
let blobDeliveredAfterAuth = false;
let binaryMessageCount = 0;
let bufferControlMessageAccepted = false;
let reconnectAfterPreOpenClose = false;

/**
 * Creates one manual clock with inspectable timeout scheduling.
 */
function createManualClock(): {
  clock: {
    setTimeout(handler: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
  };
  timers: ScheduledTimer[];
  runTimerByDelay(delayMs: number): void;
} {
  const timers: ScheduledTimer[] = [];
  let nextId = 1;
  return {
    clock: {
      setTimeout: (handler: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
        const timerId = nextId as unknown as ReturnType<typeof setTimeout>;
        const timer: ScheduledTimer = {
          id: timerId,
          delayMs,
          handler,
        };
        nextId += 1;
        timers.push(timer);
        return timerId;
      },
      clearTimeout: (timeout: ReturnType<typeof setTimeout>): void => {
        const index = timers.findIndex((timer) => timer.id === timeout);
        if (index >= 0) {
          timers.splice(index, 1);
        }
      },
    },
    timers,
    runTimerByDelay: (delayMs: number): void => {
      const index = timers.findIndex((timer) => timer.delayMs === delayMs);
      if (index < 0) {
        return;
      }

      const timer = timers[index];
      timers.splice(index, 1);
      timer.handler();
    },
  };
}

/**
 * Creates one manual relay-client socket with explicit lifecycle event emitters.
 */
function createManualSocket(): ManualSocket {
  const state = {
    sent: [] as Array<string | Buffer>,
    closed: [] as Array<{ code?: number; reason?: string }>,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onclose: null as ((event: { code?: number; reason?: string }) => void) | null,
    onerror: null as (() => void) | null,
  };
  return {
    ...state,
    send(data: string | Buffer): void {
      state.sent.push(data);
    },
    close(code?: number, reason?: string): void {
      state.closed.push({ code, reason });
    },
    emitOpen(): void {
      state.onopen?.();
    },
    emitTextMessage(data: string): void {
      state.onmessage?.({ data });
    },
    emitBinaryMessage(data: Buffer): void {
      state.onmessage?.({ data });
    },
    emitBlobMessage(data: Blob): void {
      state.onmessage?.({ data });
    },
    emitClose(code?: number, reason?: string): void {
      state.onclose?.({ code, reason });
    },
    get onopen(): (() => void) | null {
      return state.onopen;
    },
    set onopen(value: (() => void) | null) {
      state.onopen = value;
    },
    get onmessage(): ((event: { data: unknown }) => void) | null {
      return state.onmessage;
    },
    set onmessage(value: ((event: { data: unknown }) => void) | null) {
      state.onmessage = value;
    },
    get onclose(): ((event: { code?: number; reason?: string }) => void) | null {
      return state.onclose;
    },
    set onclose(value: ((event: { code?: number; reason?: string }) => void) | null) {
      state.onclose = value;
    },
    get onerror(): (() => void) | null {
      return state.onerror;
    },
    set onerror(value: (() => void) | null) {
      state.onerror = value;
    },
  };
}

beforeAll(async (): Promise<void> => {
  reconnectDelayAttemptOne = resolveReconnectDelayMs({
    reconnectAttempt: 1,
    baseDelayMs: 100,
    maxDelayMs: 1000,
  });
  reconnectDelayAttemptTwo = resolveReconnectDelayMs({
    reconnectAttempt: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
  });
  reconnectDelayCapped = resolveReconnectDelayMs({
    reconnectAttempt: 10,
    baseDelayMs: 100,
    maxDelayMs: 1000,
  });

  const keyPair = generateKeyPairSync('ed25519');
  const privateKeyPem = keyPair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  const publicKeyBase32 = 'persona-public-key-base32';
  const manualClock = createManualClock();
  const sockets: ManualSocket[] = [];

  const client = startRelayClient({
    config: {
      relayWsUrl: 'ws://relay.local/ws',
      publicKeyBase32,
      privateKeyPem,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 40,
      heartbeatTimeoutMs: 25,
    },
    clock: manualClock.clock,
    socketFactory: (): ManualSocket => {
      const socket = createManualSocket();
      sockets.push(socket);
      return socket;
    },
    callbacks: {
      onAuthenticated: (): void => {
        authenticatedAfterAuthOk = true;
      },
      onDisconnected: (args): void => {
        reconnectDelayCaptured = args.reconnectDelayMs;
      },
      onBinaryMessage: (): void => {
        binaryMessageCount += 1;
        binaryDeliveredAfterAuth = binaryMessageCount >= 1;
        blobDeliveredAfterAuth = binaryMessageCount >= 2;
      },
    },
  });

  const firstSocket = sockets[0];
  firstSocket.emitBinaryMessage(Buffer.from('ignored-before-auth', 'utf8'));
  binaryIgnoredBeforeAuth = binaryDeliveredAfterAuth === false;
  firstSocket.emitOpen();
  const challengeRequestPayload = JSON.parse(
    String(firstSocket.sent[0] ?? '{}'),
  ) as Record<string, unknown>;
  preAuthSendThrows = false;
  try {
    client.sendTextMessage({
      messageJson: JSON.stringify({ type: 'test' }),
    });
  } catch {
    preAuthSendThrows = true;
  }

  firstSocket.emitTextMessage(JSON.stringify({
    type: 'auth_challenge',
    challengeId: 'challenge-1',
    challengeText: 'relay-auth:challenge-1:nonce-1',
  }));
  await Promise.resolve();
  const challengeResponsePayload = JSON.parse(
    String(firstSocket.sent[1] ?? '{}'),
  ) as Record<string, unknown>;
  const signatureBase64 = String(challengeResponsePayload.signatureBase64 ?? '');
  authSignatureVerified = verify(
    null,
    Buffer.from('relay-auth:challenge-1:nonce-1', 'utf8'),
    keyPair.publicKey,
    Buffer.from(signatureBase64, 'base64'),
  );

  firstSocket.emitTextMessage(JSON.stringify({
    type: 'auth_ok',
  }));
  await Promise.resolve();
  client.sendBinaryFrame({
    frame: Buffer.from('test-frame', 'utf8'),
  });
  firstSocket.emitBinaryMessage(Buffer.from('inbound-frame', 'utf8'));
  if (typeof Blob !== 'undefined') {
    firstSocket.emitBlobMessage(new Blob([Buffer.from('inbound-frame-blob', 'utf8')]));
    await waitForCondition({
      timeoutMs: 250,
      intervalMs: 5,
      predicate: (): boolean => binaryMessageCount >= 2,
      timeoutMessage: 'Timed out waiting for relay client test condition.',
    });
  } else {
    blobDeliveredAfterAuth = true;
  }
  firstSocket.emitClose(1006, 'connection_lost');
  manualClock.runTimerByDelay(10);
  reconnectSocketCreated = sockets.length === 2;

  const secondSocket = sockets[1];
  secondSocket.emitOpen();
  secondSocket.emitBinaryMessage(Buffer.from(JSON.stringify({
    type: 'auth_challenge',
    challengeId: 'challenge-2',
    challengeText: 'relay-auth:challenge-2:nonce-2',
  }), 'utf8'));
  await Promise.resolve();
  bufferControlMessageAccepted = String(secondSocket.sent[1] ?? '').includes('auth_challenge_response');
  secondSocket.emitTextMessage(JSON.stringify({
    type: 'auth_ok',
  }));
  await Promise.resolve();
  manualClock.runTimerByDelay(25);
  authenticatedIdleCloseCode = secondSocket.closed[0]?.code ?? 0;

  const timeoutClock = createManualClock();
  const timeoutSockets: ManualSocket[] = [];
  const timeoutClient = startRelayClient({
    config: {
      relayWsUrl: 'ws://relay.local/ws',
      publicKeyBase32,
      privateKeyPem,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 40,
      heartbeatTimeoutMs: 25,
    },
    clock: timeoutClock.clock,
    socketFactory: (): ManualSocket => {
      const socket = createManualSocket();
      timeoutSockets.push(socket);
      return socket;
    },
  });
  timeoutSockets[0].emitOpen();
  timeoutClock.runTimerByDelay(25);
  unauthenticatedHandshakeTimeoutCloseCode = timeoutSockets[0].closed[0]?.code ?? 0;
  timeoutClient.stop();

  const preOpenCloseClock = createManualClock();
  const preOpenCloseSockets: ManualSocket[] = [];
  const preOpenCloseClient = startRelayClient({
    config: {
      relayWsUrl: 'ws://relay.local/ws',
      publicKeyBase32,
      privateKeyPem,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 40,
      heartbeatTimeoutMs: 25,
    },
    clock: preOpenCloseClock.clock,
    socketFactory: (): ManualSocket => {
      const socket = createManualSocket();
      preOpenCloseSockets.push(socket);
      return socket;
    },
  });
  preOpenCloseSockets[0].emitClose(1006, 'connect_failed');
  preOpenCloseClock.runTimerByDelay(10);
  reconnectAfterPreOpenClose = preOpenCloseSockets.length === 2;
  preOpenCloseClient.stop();

  void challengeRequestPayload;
});

describe('gateway relay client backoff behavior', () => {
  it('uses base reconnect delay for first reconnect attempt', () => {
    expect(reconnectDelayAttemptOne).toBe(100);
  });

  it('doubles reconnect delay for second reconnect attempt', () => {
    expect(reconnectDelayAttemptTwo).toBe(200);
  });

  it('caps reconnect delay at configured max threshold', () => {
    expect(reconnectDelayCapped).toBe(1000);
  });
});

describe('gateway relay client auth and gating', () => {
  it('rejects outbound text messages before relay auth completion', () => {
    expect(preAuthSendThrows).toBe(true);
  });

  it('signs challenge responses with persona private key material', () => {
    expect(authSignatureVerified).toBe(true);
  });

  it('marks relay client authenticated after auth_ok response', () => {
    expect(authenticatedAfterAuthOk).toBe(true);
  });

  it('ignores inbound binary tunnel data before auth completion', () => {
    expect(binaryIgnoredBeforeAuth).toBe(true);
  });

  it('delivers inbound binary tunnel data callbacks after auth completion', () => {
    expect(binaryDeliveredAfterAuth).toBe(true);
  });

  it('delivers inbound blob tunnel data callbacks after auth completion', () => {
    expect(blobDeliveredAfterAuth).toBe(true);
  });

  it('accepts buffer-encoded relay control payloads during auth handshake', () => {
    expect(bufferControlMessageAccepted).toBe(true);
  });
});

describe('gateway relay client reconnect and heartbeat', () => {
  it('schedules reconnect and creates a new socket after disconnect', () => {
    expect(reconnectSocketCreated).toBe(true);
  });

  it('uses computed reconnect delay for first disconnect', () => {
    expect(reconnectDelayCaptured).toBe(10);
  });

  it('reconnects after a socket closes before open completes', () => {
    expect(reconnectAfterPreOpenClose).toBe(true);
  });

  it('does not close authenticated idle sockets on heartbeat timeout interval', () => {
    expect(authenticatedIdleCloseCode).toBe(0);
  });

  it('closes unauthenticated sockets when handshake heartbeat timeout elapses', () => {
    expect(unauthenticatedHandshakeTimeoutCloseCode).toBe(4408);
  });
});
