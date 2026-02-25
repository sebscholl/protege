import type { KeyObject } from 'node:crypto';

import { createPrivateKey, sign } from 'node:crypto';

/**
 * Represents one websocket message event shape used by relay client runtime.
 */
export type RelayClientMessageEvent = {
  data: unknown;
};

/**
 * Represents one websocket close event shape used by relay client runtime.
 */
export type RelayClientCloseEvent = {
  code?: number;
  reason?: string;
};

/**
 * Represents one websocket-compatible socket used by relay client runtime.
 */
export type RelayClientSocket = {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: RelayClientMessageEvent) => void) | null;
  onclose: ((event: RelayClientCloseEvent) => void) | null;
  onerror: (() => void) | null;
};

/**
 * Represents one clock abstraction used for reconnect and heartbeat timers.
 */
export type RelayClientClock = {
  setTimeout(handler: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
};

/**
 * Represents one outbound relay websocket socket factory.
 */
export type RelayClientSocketFactory = (
  args: {
    url: string;
  },
) => RelayClientSocket;

/**
 * Represents one relay client runtime status snapshot.
 */
export type RelayClientStatus = {
  connected: boolean;
  authenticated: boolean;
  reconnectAttempt: number;
};

/**
 * Represents one relay client runtime configuration.
 */
export type RelayClientConfig = {
  relayWsUrl: string;
  publicKeyBase32: string;
  privateKeyPem: string;
  sessionRole?: 'inbound' | 'outbound';
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  heartbeatTimeoutMs: number;
};

/**
 * Represents one started relay client runtime controller.
 */
export type RelayClientController = {
  stop(): void;
  sendTextMessage(
    args: {
      messageJson: string;
    },
  ): void;
  sendBinaryFrame(
    args: {
      frame: Buffer;
    },
  ): void;
  readStatus(): RelayClientStatus;
};

/**
 * Represents callbacks emitted by relay client lifecycle and message flow.
 */
export type RelayClientCallbacks = {
  onAuthenticated?: () => void;
  onDisconnected?: (
    args: {
      reconnectDelayMs: number;
      reconnectAttempt: number;
    },
  ) => void;
  onControlMessage?: (
    args: {
      payload: Record<string, unknown>;
    },
  ) => void;
  onBinaryMessage?: (
    args: {
      payload: Buffer;
    },
  ) => void;
};

/**
 * Starts one relay websocket client runtime with auth handshake and reconnect behavior.
 */
export function startRelayClient(
  args: {
    config: RelayClientConfig;
    socketFactory?: RelayClientSocketFactory;
    clock?: RelayClientClock;
    callbacks?: RelayClientCallbacks;
  },
): RelayClientController {
  const clock = args.clock ?? defaultRelayClientClock();
  const socketFactory = args.socketFactory ?? defaultRelayClientSocketFactory();
  const privateKey = createPrivateKey(args.config.privateKeyPem);

  let stopped = false;
  let authenticated = false;
  let connected = false;
  let reconnectAttempt = 0;
  let socket: RelayClientSocket | undefined;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;

  const clearHeartbeatTimeout = (): void => {
    if (heartbeatTimeout) {
      clock.clearTimeout(heartbeatTimeout);
      heartbeatTimeout = undefined;
    }
  };

  const scheduleHeartbeatTimeout = (): void => {
    if (authenticated) {
      return;
    }

    clearHeartbeatTimeout();
    heartbeatTimeout = clock.setTimeout((): void => {
      if (!socket) {
        return;
      }

      if (authenticated) {
        return;
      }

      socket.close(4408, 'heartbeat_timeout');
    }, args.config.heartbeatTimeoutMs);
  };

  const clearReconnectTimeout = (): void => {
    if (reconnectTimeout) {
      clock.clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }
  };

  const closeSocket = (
    closeArgs: {
      code: number;
      reason: string;
    },
  ): void => {
    if (!socket) {
      return;
    }

    socket.close(closeArgs.code, closeArgs.reason);
  };

  const connect = (): void => {
    if (stopped) {
      return;
    }

    clearReconnectTimeout();
    clearHeartbeatTimeout();
    const currentSocket = socketFactory({
      url: args.config.relayWsUrl,
    });
    socket = currentSocket;

    currentSocket.onopen = (): void => {
      connected = true;
      authenticated = false;
      currentSocket.send(JSON.stringify({
        type: 'auth_challenge_request',
        publicKeyBase32: args.config.publicKeyBase32,
        sessionRole: args.config.sessionRole ?? 'inbound',
      }));
      scheduleHeartbeatTimeout();
    };

    currentSocket.onmessage = (event: RelayClientMessageEvent): void => {
      void handleRelayClientMessage({
        event,
        scheduleHeartbeatTimeout,
        onBinaryMessage: (
          onBinaryArgs: {
            payload: Buffer;
          },
        ): void => {
          if (!authenticated) {
            return;
          }

          args.callbacks?.onBinaryMessage?.({
            payload: onBinaryArgs.payload,
          });
        },
        onControlPayload: (
          onControlArgs: {
            payload: Record<string, unknown>;
          },
        ): void => {
          const payload = onControlArgs.payload;
          args.callbacks?.onControlMessage?.({ payload });

          if (
            payload.type === 'auth_challenge'
            && typeof payload.challengeText === 'string'
            && typeof payload.challengeId === 'string'
          ) {
            const signatureBase64 = signRelayChallenge({
              privateKey,
              challengeText: payload.challengeText,
            });
            currentSocket.send(JSON.stringify({
              type: 'auth_challenge_response',
              publicKeyBase32: args.config.publicKeyBase32,
              challengeId: payload.challengeId,
              signatureBase64,
              sessionRole: args.config.sessionRole ?? 'inbound',
            }));
            return;
          }

          if (payload.type === 'auth_ok') {
            authenticated = true;
            reconnectAttempt = 0;
            clearHeartbeatTimeout();
            args.callbacks?.onAuthenticated?.();
          }
        },
      });
    };

    currentSocket.onerror = (): void => {
      // Relay runtime handles close semantics for reconnect scheduling.
    };

    currentSocket.onclose = (): void => {
      const wasConnected = connected;
      connected = false;
      authenticated = false;
      clearHeartbeatTimeout();
      if (!wasConnected || stopped) {
        return;
      }

      reconnectAttempt += 1;
      const reconnectDelayMs = resolveReconnectDelayMs({
        reconnectAttempt,
        baseDelayMs: args.config.reconnectBaseDelayMs,
        maxDelayMs: args.config.reconnectMaxDelayMs,
      });
      args.callbacks?.onDisconnected?.({
        reconnectDelayMs,
        reconnectAttempt,
      });
      reconnectTimeout = clock.setTimeout((): void => {
        connect();
      }, reconnectDelayMs);
    };
  };

  connect();

  return {
    stop: (): void => {
      stopped = true;
      clearReconnectTimeout();
      clearHeartbeatTimeout();
      closeSocket({
        code: 1000,
        reason: 'client_stopped',
      });
    },
    sendTextMessage: (
      sendArgs: {
        messageJson: string;
      },
    ): void => {
      if (!socket || !authenticated) {
        throw new Error('Relay client cannot send text messages before authentication.');
      }

      socket.send(sendArgs.messageJson);
    },
    sendBinaryFrame: (
      sendArgs: {
        frame: Buffer;
      },
    ): void => {
      if (!socket || !authenticated) {
        throw new Error('Relay client cannot send binary frames before authentication.');
      }

      socket.send(sendArgs.frame);
    },
    readStatus: (): RelayClientStatus => {
      return {
        connected,
        authenticated,
        reconnectAttempt,
      };
    },
  };
}

/**
 * Handles one inbound relay websocket message and routes normalized payloads to callbacks.
 */
export async function handleRelayClientMessage(
  args: {
    event: RelayClientMessageEvent;
    scheduleHeartbeatTimeout: () => void;
    onBinaryMessage: (
      args: {
        payload: Buffer;
      },
    ) => void;
    onControlPayload: (
      args: {
        payload: Record<string, unknown>;
      },
    ) => void;
  },
): Promise<void> {
  args.scheduleHeartbeatTimeout();
  const normalizedPayload = await normalizeRelayClientIncomingPayload({
    value: args.event.data,
  });
  if (normalizedPayload.type === 'binary') {
    args.onBinaryMessage({
      payload: normalizedPayload.payload,
    });
    return;
  }

  if (normalizedPayload.type !== 'text') {
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(normalizedPayload.payload) as Record<string, unknown>;
  } catch {
    return;
  }

  args.onControlPayload({
    payload,
  });
}

/**
 * Normalizes one incoming websocket payload into text, binary, or unsupported values.
 */
export async function normalizeRelayClientIncomingPayload(
  args: {
    value: unknown;
  },
): Promise<
  | {
      type: 'binary';
      payload: Buffer;
    }
  | {
      type: 'text';
      payload: string;
    }
  | {
      type: 'unsupported';
    }
> {
  if (typeof args.value === 'string') {
    return {
      type: 'text',
      payload: args.value,
    };
  }

  if (Buffer.isBuffer(args.value)) {
    return normalizeRelayBinaryLikePayload({
      payload: args.value,
    });
  }

  if (args.value instanceof ArrayBuffer) {
    return normalizeRelayBinaryLikePayload({
      payload: Buffer.from(args.value),
    });
  }

  if (typeof Blob !== 'undefined' && args.value instanceof Blob) {
    return normalizeRelayBinaryLikePayload({
      payload: Buffer.from(await args.value.arrayBuffer()),
    });
  }

  return {
    type: 'unsupported',
  };
}

/**
 * Normalizes one binary-like websocket payload into control text when JSON-shaped, else binary.
 */
export function normalizeRelayBinaryLikePayload(
  args: {
    payload: Buffer;
  },
):
  | {
      type: 'binary';
      payload: Buffer;
    }
  | {
      type: 'text';
      payload: string;
    } {
  const textPayload = args.payload.toString('utf8');
  if (isRelayControlMessageJson({
    value: textPayload,
  })) {
    return {
      type: 'text',
      payload: textPayload,
    };
  }

  return {
    type: 'binary',
    payload: args.payload,
  };
}

/**
 * Returns true when one string decodes into a relay control JSON payload shape.
 */
export function isRelayControlMessageJson(
  args: {
    value: string;
  },
): boolean {
  try {
    const parsed = JSON.parse(args.value) as Record<string, unknown>;
    return typeof parsed.type === 'string';
  } catch {
    return false;
  }
}

/**
 * Signs one challenge text payload with persona passport private key.
 */
export function signRelayChallenge(
  args: {
    privateKey: KeyObject;
    challengeText: string;
  },
): string {
  return sign(
    null,
    Buffer.from(args.challengeText, 'utf8'),
    args.privateKey,
  ).toString('base64');
}

/**
 * Resolves reconnect delay for one exponential backoff attempt.
 */
export function resolveReconnectDelayMs(
  args: {
    reconnectAttempt: number;
    baseDelayMs: number;
    maxDelayMs: number;
  },
): number {
  const exponent = Math.max(0, args.reconnectAttempt - 1);
  const backoffDelayMs = args.baseDelayMs * (2 ** exponent);
  return Math.min(backoffDelayMs, args.maxDelayMs);
}

/**
 * Creates the default clock implementation from global timer primitives.
 */
export function defaultRelayClientClock(): RelayClientClock {
  return {
    setTimeout: (handler: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
      return setTimeout(handler, delayMs);
    },
    clearTimeout: (timeout: ReturnType<typeof setTimeout>): void => {
      clearTimeout(timeout);
    },
  };
}

/**
 * Creates one default websocket factory backed by global WebSocket runtime.
 */
export function defaultRelayClientSocketFactory(): RelayClientSocketFactory {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is unavailable in this Node runtime.');
  }

  return (
    socketArgs: {
      url: string;
    },
  ): RelayClientSocket => {
    const socket = new WebSocket(socketArgs.url);
    return socket as unknown as RelayClientSocket;
  };
}
