/**
 * Represents one token-bucket configuration for relay rate limiting.
 */
export type RelayRateLimitConfig = {
  capacity: number;
  refillPerSecond: number;
  denyWindowMs: number;
};

/**
 * Represents one tracked limiter entry for one key.
 */
export type RelayRateLimitEntry = {
  tokens: number;
  lastRefillAtMs: number;
  blockedUntilMs: number;
};

/**
 * Represents one in-memory relay rate limiter state map.
 */
export type RelayRateLimitState = Map<string, RelayRateLimitEntry>;

/**
 * Represents one relay rate-limit consume result payload.
 */
export type RelayRateLimitConsumeResult = {
  allowed: boolean;
  retryAfterMs: number;
  reason?: 'blocked' | 'rate_limited';
};

/**
 * Creates one empty relay rate limiter state map.
 */
export function createRelayRateLimitState(): RelayRateLimitState {
  return new Map<string, RelayRateLimitEntry>();
}

/**
 * Consumes one token for a key and returns allow/deny metadata.
 */
export function consumeRelayRateLimit(
  args: {
    state: RelayRateLimitState;
    key: string;
    config: RelayRateLimitConfig;
    nowMs: number;
  },
): RelayRateLimitConsumeResult {
  const existing = args.state.get(args.key);
  const entry = existing
    ? refillRelayRateLimitEntry({
        entry: existing,
        config: args.config,
        nowMs: args.nowMs,
      })
    : {
        tokens: args.config.capacity,
        lastRefillAtMs: args.nowMs,
        blockedUntilMs: 0,
      };
  if (entry.blockedUntilMs > args.nowMs) {
    args.state.set(args.key, entry);
    return {
      allowed: false,
      retryAfterMs: Math.max(1, entry.blockedUntilMs - args.nowMs),
      reason: 'blocked',
    };
  }
  if (entry.tokens >= 1) {
    entry.tokens -= 1;
    args.state.set(args.key, entry);
    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  entry.blockedUntilMs = args.nowMs + args.config.denyWindowMs;
  args.state.set(args.key, entry);
  return {
    allowed: false,
    retryAfterMs: Math.max(1, args.config.denyWindowMs),
    reason: 'rate_limited',
  };
}

/**
 * Refills one limiter entry based on elapsed wall time.
 */
export function refillRelayRateLimitEntry(
  args: {
    entry: RelayRateLimitEntry;
    config: RelayRateLimitConfig;
    nowMs: number;
  },
): RelayRateLimitEntry {
  if (args.nowMs <= args.entry.lastRefillAtMs) {
    return {
      ...args.entry,
    };
  }
  const elapsedMs = args.nowMs - args.entry.lastRefillAtMs;
  const refillAmount = (elapsedMs / 1000) * args.config.refillPerSecond;
  return {
    ...args.entry,
    tokens: Math.min(args.config.capacity, args.entry.tokens + refillAmount),
    lastRefillAtMs: args.nowMs,
    blockedUntilMs: args.entry.blockedUntilMs > 0 && args.entry.blockedUntilMs <= args.nowMs
      ? 0
      : args.entry.blockedUntilMs,
  };
}

/**
 * Sweeps stale limiter entries that are no longer active.
 */
export function sweepRelayRateLimitState(
  args: {
    state: RelayRateLimitState;
    nowMs: number;
    staleAfterMs: number;
  },
): number {
  let removedCount = 0;
  for (const [key, entry] of args.state.entries()) {
    const stale = (args.nowMs - entry.lastRefillAtMs) > args.staleAfterMs;
    const notBlocked = entry.blockedUntilMs <= args.nowMs;
    const fullyRefilled = entry.tokens >= 1;
    if (stale && notBlocked && fullyRefilled) {
      args.state.delete(key);
      removedCount += 1;
    }
  }

  return removedCount;
}

/**
 * Builds one token-bucket config from per-minute request rates.
 */
export function buildRelayRateLimitConfig(
  args: {
    perMinute: number;
    denyWindowMs: number;
  },
): RelayRateLimitConfig {
  return {
    capacity: args.perMinute,
    refillPerSecond: args.perMinute / 60,
    denyWindowMs: args.denyWindowMs,
  };
}
