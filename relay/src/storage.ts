/**
 * Represents one persisted relay identity record.
 */
export type RelayIdentityRecord = {
  publicKeyBase32: string;
  emailLocalPart: string;
  createdAt: string;
  lastSeenAt: string;
  status: 'active';
};

/**
 * Represents one persisted relay auth challenge.
 */
export type RelayChallengeRecord = {
  challengeId: string;
  publicKeyBase32: string;
  challengeText: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

/**
 * Represents one in-memory relay store for identities and challenges.
 */
export type RelayStore = {
  identitiesByPublicKey: Map<string, RelayIdentityRecord>;
  challengesById: Map<string, RelayChallengeRecord>;
};

/**
 * Creates one in-memory relay store.
 */
export function createRelayStore(): RelayStore {
  return {
    identitiesByPublicKey: new Map<string, RelayIdentityRecord>(),
    challengesById: new Map<string, RelayChallengeRecord>(),
  };
}

/**
 * Saves one challenge record in the relay store.
 */
export function saveRelayChallenge(
  args: {
    store: RelayStore;
    challenge: RelayChallengeRecord;
  },
): void {
  args.store.challengesById.set(args.challenge.challengeId, args.challenge);
}

/**
 * Reads one challenge record by challenge id.
 */
export function readRelayChallenge(
  args: {
    store: RelayStore;
    challengeId: string;
  },
): RelayChallengeRecord | undefined {
  return args.store.challengesById.get(args.challengeId);
}

/**
 * Marks one challenge as used at one timestamp.
 */
export function markRelayChallengeUsed(
  args: {
    store: RelayStore;
    challengeId: string;
    usedAt: string;
  },
): void {
  const challenge = readRelayChallenge({
    store: args.store,
    challengeId: args.challengeId,
  });
  if (!challenge) {
    return;
  }

  args.store.challengesById.set(args.challengeId, {
    ...challenge,
    usedAt: args.usedAt,
  });
}

/**
 * Upserts one identity record and preserves createdAt for existing identities.
 */
export function upsertRelayIdentity(
  args: {
    store: RelayStore;
    identity: RelayIdentityRecord;
  },
): RelayIdentityRecord {
  const existing = args.store.identitiesByPublicKey.get(args.identity.publicKeyBase32);
  const upserted: RelayIdentityRecord = existing
    ? {
        ...existing,
        lastSeenAt: args.identity.lastSeenAt,
        status: args.identity.status,
      }
    : args.identity;

  args.store.identitiesByPublicKey.set(args.identity.publicKeyBase32, upserted);
  return upserted;
}

/**
 * Reads one identity by public key from relay storage.
 */
export function readRelayIdentity(
  args: {
    store: RelayStore;
    publicKeyBase32: string;
  },
): RelayIdentityRecord | undefined {
  return args.store.identitiesByPublicKey.get(args.publicKeyBase32);
}
