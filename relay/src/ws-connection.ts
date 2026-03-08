import type { RelaySocket } from '@relay/src/session-registry';
import type { RelayStore } from '@relay/src/storage';
import type { RelayTunnelFrame } from '@relay/src/tunnel';
import type { RelayWsAuthState } from '@relay/src/ws-auth';

import { randomUUID } from 'node:crypto';

import type { RelaySessionRegistry } from '@relay/src/session-registry';
import { removeRelaySessionBySocketId } from '@relay/src/session-registry';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createRelayWsAuthState, handleRelayWsAuthControlMessage } from '@relay/src/ws-auth';
import type { RelayRateLimitState } from '@relay/src/rate-limit';

/**
 * Represents one minimal websocket runtime contract used by relay connection logic.
 */
export type RelayWsConnectionSocket = {
  send(payload: string | Buffer): void;
  close(
    code: number,
    reason: string,
  ): void;
  on(
    event: 'message' | 'close',
    listener: (payload?: unknown) => void,
  ): void;
};

/**
 * Represents relay auth/runtime state required for websocket message handling.
 */
export type RelayWsRuntime = {
  store: RelayStore;
  registry: RelaySessionRegistry;
  authRateLimit?: {
    state: RelayRateLimitState;
    attemptsPerMinutePerIp: number;
    denyWindowMs: number;
  };
  authChallengePolicy?: {
    ttlSeconds: number;
    maxRecords: number;
  };
  onWsAuthEvent?: (
    args: {
      event: 'attempted' | 'challenged' | 'accepted' | 'rejected';
      remoteAddress: string;
      publicKeyBase32?: string;
      code?: string;
      sessionRole?: 'inbound' | 'outbound';
    },
  ) => void;
  onOutboundTunnelFrame?: (
    args: {
      frame: RelayTunnelFrame;
      socketId: string;
      publicKeyBase32: string;
    },
  ) => void;
};

/**
 * Converts one raw websocket message payload into a UTF-8 JSON string.
 */
export function toRelayWsMessageJson(
  args: {
    payload: unknown;
  },
): string | undefined {
  if (typeof args.payload === 'string') {
    return args.payload;
  }

  if (Buffer.isBuffer(args.payload)) {
    return args.payload.toString('utf8');
  }

  if (args.payload instanceof ArrayBuffer) {
    return Buffer.from(args.payload).toString('utf8');
  }

  if (Array.isArray(args.payload) && args.payload.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(args.payload as Buffer[]).toString('utf8');
  }

  return undefined;
}

/**
 * Attaches relay websocket message and close listeners for one accepted socket.
 */
export function attachRelayWsConnection(
  args: {
    ws: RelayWsConnectionSocket;
    runtime: RelayWsRuntime;
    nowIso: () => string;
    socketId?: string;
    remoteAddress?: string;
  },
): {
  socketId: string;
} {
  let state: RelayWsAuthState = createRelayWsAuthState();
  const socketId = args.socketId ?? randomUUID();
  const socket: RelaySocket = {
    id: socketId,
    send: (payload: string | Buffer): void => {
      args.ws.send(payload);
    },
    close: (
      code: number,
      reason: string,
    ): void => {
      args.ws.close(code, reason);
    },
  };

  args.ws.on('message', (payload?: unknown): void => {
    const isBinaryPayload = Buffer.isBuffer(payload) || payload instanceof ArrayBuffer;
    if (state.authenticated && state.publicKeyBase32 && isBinaryPayload) {
      const binaryPayload = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload as ArrayBuffer);
      const frame = parseRelayTunnelFrame({
        payload: binaryPayload,
      });
      if (!frame) {
        socket.send(JSON.stringify({
          type: 'auth_error',
          code: 'invalid_tunnel_frame',
        }));
        socket.close(4401, 'invalid_tunnel_frame');
        return;
      }

      args.runtime.onOutboundTunnelFrame?.({
        frame,
        socketId,
        publicKeyBase32: state.publicKeyBase32,
      });
      return;
    }

    const messageJson = toRelayWsMessageJson({
      payload,
    });
    if (!messageJson) {
      socket.send(JSON.stringify({
        type: 'auth_error',
        code: 'invalid_message',
      }));
      socket.close(4401, 'invalid_message');
      return;
    }

    state = handleRelayWsAuthControlMessage({
      store: args.runtime.store,
      registry: args.runtime.registry,
      socket,
      state,
      messageJson,
      nowIso: args.nowIso(),
      remoteAddress: args.remoteAddress,
      authRateLimit: args.runtime.authRateLimit,
      authChallengePolicy: args.runtime.authChallengePolicy,
      onWsAuthEvent: args.runtime.onWsAuthEvent,
    }).state;
  });

  args.ws.on('close', (): void => {
    removeRelaySessionBySocketId({
      registry: args.runtime.registry,
      socketId,
    });
  });

  return {
    socketId,
  };
}
