import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildRelayRateLimitConfig,
  consumeRelayRateLimit,
  createRelayRateLimitState,
  sweepRelayRateLimitState,
} from '@relay/src/rate-limit';

let firstConsumeAllowed = false;
let secondConsumeAllowed = false;
let thirdConsumeAllowed = false;
let blockedRetryAfterMs = 0;
let consumeAfterRefillAllowed = false;
let sweptCount = 0;
let builtCapacity = 0;
let builtRefillPerSecond = 0;

beforeAll((): void => {
  const state = createRelayRateLimitState();
  const config = buildRelayRateLimitConfig({
    perMinute: 2,
    denyWindowMs: 1000,
  });
  builtCapacity = config.capacity;
  builtRefillPerSecond = config.refillPerSecond;
  firstConsumeAllowed = consumeRelayRateLimit({
    state,
    key: '127.0.0.1',
    config,
    nowMs: 0,
  }).allowed;
  secondConsumeAllowed = consumeRelayRateLimit({
    state,
    key: '127.0.0.1',
    config,
    nowMs: 1,
  }).allowed;
  const blockedConsume = consumeRelayRateLimit({
    state,
    key: '127.0.0.1',
    config,
    nowMs: 2,
  });
  thirdConsumeAllowed = blockedConsume.allowed;
  blockedRetryAfterMs = blockedConsume.retryAfterMs;
  consumeAfterRefillAllowed = consumeRelayRateLimit({
    state,
    key: '127.0.0.1',
    config,
    nowMs: 60_000,
  }).allowed;
  const staleState = createRelayRateLimitState();
  staleState.set('stale-key', {
    tokens: config.capacity,
    lastRefillAtMs: 0,
    blockedUntilMs: 0,
  });
  sweptCount = sweepRelayRateLimitState({
    state: staleState,
    nowMs: 120_000,
    staleAfterMs: 30_000,
  });
});

describe('relay rate limiter behavior', () => {
  it('allows first token consumption for one key', () => {
    expect(firstConsumeAllowed).toBe(true);
  });

  it('allows second token consumption while capacity remains', () => {
    expect(secondConsumeAllowed).toBe(true);
  });

  it('denies once capacity is exhausted', () => {
    expect(thirdConsumeAllowed).toBe(false);
  });

  it('returns retry-after metadata when denied', () => {
    expect(blockedRetryAfterMs > 0).toBe(true);
  });

  it('allows consumption again after refill time passes', () => {
    expect(consumeAfterRefillAllowed).toBe(true);
  });

  it('sweeps stale limiter entries after inactivity window', () => {
    expect(sweptCount > 0).toBe(true);
  });

  it('builds limiter capacity from per-minute rates', () => {
    expect(builtCapacity).toBe(2);
  });

  it('builds limiter refill rate from per-minute rates', () => {
    expect(builtRefillPerSecond > 0 && builtRefillPerSecond < 1).toBe(true);
  });
});
