import { randomUUID } from 'node:crypto';

import type { RelayChallengeRecord, RelayStore } from '@relay/src/storage';
import { saveRelayChallenge } from '@relay/src/storage';

/**
 * Represents one issued relay challenge payload.
 */
export type RelayIssuedChallenge = {
  challengeId: string;
  challengeText: string;
  expiresAt: string;
};

/**
 * Derives one canonical relay email local-part from public key identity.
 */
export function deriveRelayEmailLocalPart(
  args: {
    publicKeyBase32: string;
  },
): string {
  return args.publicKeyBase32.trim().toLowerCase();
}

/**
 * Issues one challenge for relay authentication and stores it with TTL metadata.
 */
export function issueRelayChallenge(
  args: {
    store: RelayStore;
    publicKeyBase32: string;
    nowIso?: string;
    ttlSeconds?: number;
    challengeId?: string;
  },
): RelayIssuedChallenge {
  const now = args.nowIso ? new Date(args.nowIso) : new Date();
  const challengeId = args.challengeId ?? randomUUID();
  const nonce = randomUUID();
  const challengeText = `relay-auth:${challengeId}:${nonce}`;
  const ttlSeconds = args.ttlSeconds ?? 60;
  const expiresAt = new Date(now.getTime() + (ttlSeconds * 1000)).toISOString();
  const record: RelayChallengeRecord = {
    challengeId,
    publicKeyBase32: deriveRelayEmailLocalPart({
      publicKeyBase32: args.publicKeyBase32,
    }),
    challengeText,
    createdAt: now.toISOString(),
    expiresAt,
  };
  saveRelayChallenge({
    store: args.store,
    challenge: record,
  });
  return {
    challengeId,
    challengeText,
    expiresAt,
  };
}
