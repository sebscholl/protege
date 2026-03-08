import { deriveRelayEmailLocalPart, issueRelayChallenge } from '@relay/src/auth/challenge';
import { buildRelayRateLimitConfig, consumeRelayRateLimit } from '@relay/src/rate-limit';
import { verifyRelayChallengeResponse } from '@relay/src/auth/verify';
import type { RelaySessionRegistry, RelaySocket } from '@relay/src/session-registry';
import { activateRelaySession } from '@relay/src/session-registry';
import type { RelayStore } from '@relay/src/storage';
import type { RelayRateLimitState } from '@relay/src/rate-limit';

/**
 * Represents one websocket connection auth state.
 */
export type RelayWsAuthState = {
  authenticated: boolean;
  publicKeyBase32?: string;
  sessionRole?: 'inbound' | 'outbound';
};

/**
 * Represents supported inbound control messages for ws auth flow.
 */
export type RelayWsAuthControlMessage =
  | {
      type: 'auth_challenge_request';
      publicKeyBase32: string;
      sessionRole?: 'inbound' | 'outbound';
    }
  | {
      type: 'auth_challenge_response';
      publicKeyBase32: string;
      challengeId: string;
      signatureBase64: string;
      sessionRole?: 'inbound' | 'outbound';
    };

/**
 * Creates default websocket auth state for a new socket.
 */
export function createRelayWsAuthState(): RelayWsAuthState {
  return {
    authenticated: false,
  };
}

/**
 * Handles one inbound ws control message for relay authentication.
 */
export function handleRelayWsAuthControlMessage(
  args: {
    store: RelayStore;
    registry: RelaySessionRegistry;
    socket: RelaySocket;
    state: RelayWsAuthState;
    messageJson: string;
    nowIso: string;
    remoteAddress?: string;
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
  },
): {
  state: RelayWsAuthState;
} {
  const remoteAddress = readRelayWsRemoteAddress({
    remoteAddress: args.remoteAddress,
  });
  args.onWsAuthEvent?.({
    event: 'attempted',
    remoteAddress,
  });
  if (args.authRateLimit) {
    const authRateLimitResult = consumeRelayRateLimit({
      state: args.authRateLimit.state,
      key: `ws:auth:${remoteAddress}`,
      config: buildRelayRateLimitConfig({
        perMinute: args.authRateLimit.attemptsPerMinutePerIp,
        denyWindowMs: args.authRateLimit.denyWindowMs,
      }),
      nowMs: Date.now(),
    });
    if (!authRateLimitResult.allowed) {
      args.socket.send(JSON.stringify({
        type: 'auth_error',
        code: 'rate_limited',
      }));
      args.socket.close(4408, 'rate_limited');
      args.onWsAuthEvent?.({
        event: 'rejected',
        remoteAddress,
        code: 'rate_limited',
      });
      return {
        state: args.state,
      };
    }
  }

  const parsed = parseRelayWsControlMessage({
    messageJson: args.messageJson,
  });
  if (!parsed) {
    args.socket.send(JSON.stringify({
      type: 'auth_error',
      code: 'invalid_message',
    }));
    args.socket.close(4401, 'invalid_message');
    args.onWsAuthEvent?.({
      event: 'rejected',
      remoteAddress,
      code: 'invalid_message',
    });
    return {
      state: args.state,
    };
  }

  if (parsed.type === 'auth_challenge_request') {
    const publicKeyBase32 = deriveRelayEmailLocalPart({
      publicKeyBase32: parsed.publicKeyBase32,
    });
    const challenge = issueRelayChallenge({
      store: args.store,
      publicKeyBase32,
      nowIso: args.nowIso,
      ttlSeconds: args.authChallengePolicy?.ttlSeconds,
      maxChallengeRecords: args.authChallengePolicy?.maxRecords,
    });
    args.socket.send(JSON.stringify({
      type: 'auth_challenge',
      publicKeyBase32,
      challengeId: challenge.challengeId,
      challengeText: challenge.challengeText,
      expiresAt: challenge.expiresAt,
    }));
    args.onWsAuthEvent?.({
      event: 'challenged',
      remoteAddress,
      publicKeyBase32,
      sessionRole: parsed.sessionRole ?? 'inbound',
    });
    return {
      state: {
        authenticated: false,
        publicKeyBase32,
        sessionRole: parsed.sessionRole ?? 'inbound',
      },
    };
  }

  const result = verifyRelayChallengeResponse({
    store: args.store,
    publicKeyBase32: parsed.publicKeyBase32,
    challengeId: parsed.challengeId,
    signatureBase64: parsed.signatureBase64,
    nowIso: args.nowIso,
  });
  if (!result.accepted || !result.identity) {
    args.socket.send(JSON.stringify({
      type: 'auth_error',
      code: result.errorCode ?? 'auth_failed',
    }));
    args.socket.close(4401, result.errorCode ?? 'auth_failed');
    args.onWsAuthEvent?.({
      event: 'rejected',
      remoteAddress,
      publicKeyBase32: parsed.publicKeyBase32,
      code: result.errorCode ?? 'auth_failed',
      sessionRole: parsed.sessionRole ?? args.state.sessionRole ?? 'inbound',
    });
    return {
      state: args.state,
    };
  }

  const activation = activateRelaySession({
    registry: args.registry,
    publicKeyBase32: result.identity.publicKeyBase32,
    socket: args.socket,
    sessionRole: parsed.sessionRole ?? args.state.sessionRole ?? 'inbound',
    nowIso: args.nowIso,
  });
  args.socket.send(JSON.stringify({
    type: 'auth_ok',
    publicKeyBase32: result.identity.publicKeyBase32,
    emailLocalPart: result.identity.emailLocalPart,
    sessionRole: parsed.sessionRole ?? args.state.sessionRole ?? 'inbound',
    replacedSocketId: activation.replacedSocketId ?? null,
  }));
  args.onWsAuthEvent?.({
    event: 'accepted',
    remoteAddress,
    publicKeyBase32: result.identity.publicKeyBase32,
    sessionRole: parsed.sessionRole ?? args.state.sessionRole ?? 'inbound',
  });
  return {
    state: {
      authenticated: true,
      publicKeyBase32: result.identity.publicKeyBase32,
      sessionRole: parsed.sessionRole ?? args.state.sessionRole ?? 'inbound',
    },
  };
}

/**
 * Parses one raw control message string into supported ws auth message variants.
 */
export function parseRelayWsControlMessage(
  args: {
    messageJson: string;
  },
): RelayWsAuthControlMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.messageJson) as unknown;
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record.type === 'auth_challenge_request' && typeof record.publicKeyBase32 === 'string') {
    const sessionRole = record.sessionRole === 'outbound'
      ? 'outbound'
      : record.sessionRole === 'inbound'
        ? 'inbound'
        : undefined;
    return {
      type: 'auth_challenge_request',
      publicKeyBase32: record.publicKeyBase32,
      sessionRole,
    };
  }

  if (
    record.type === 'auth_challenge_response'
    && typeof record.publicKeyBase32 === 'string'
    && typeof record.challengeId === 'string'
    && typeof record.signatureBase64 === 'string'
  ) {
    const sessionRole = record.sessionRole === 'outbound'
      ? 'outbound'
      : record.sessionRole === 'inbound'
        ? 'inbound'
        : undefined;
    return {
      type: 'auth_challenge_response',
      publicKeyBase32: record.publicKeyBase32,
      challengeId: record.challengeId,
      signatureBase64: record.signatureBase64,
      sessionRole,
    };
  }

  return undefined;
}

/**
 * Reads one websocket remote address value with fallback for unknown sources.
 */
export function readRelayWsRemoteAddress(
  args: {
    remoteAddress?: string;
  },
): string {
  return args.remoteAddress && args.remoteAddress.trim().length > 0
    ? args.remoteAddress.trim()
    : 'unknown';
}
