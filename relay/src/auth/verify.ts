import { verify } from 'node:crypto';

import { deriveRelayEmailLocalPart } from '@relay/src/auth/challenge';
import { publicKeyBase32ToKeyObject } from '@relay/src/crypto';
import type { RelayIdentityRecord, RelayStore } from '@relay/src/storage';
import {
  markRelayChallengeUsed,
  readRelayChallenge,
  upsertRelayIdentity,
} from '@relay/src/storage';

/**
 * Enumerates failure codes for relay challenge verification.
 */
export type RelayChallengeVerifyErrorCode =
  | 'challenge_not_found'
  | 'challenge_mismatch'
  | 'challenge_expired'
  | 'challenge_already_used'
  | 'invalid_signature_encoding'
  | 'invalid_signature';

/**
 * Represents one relay challenge verification result payload.
 */
export type RelayChallengeVerifyResult = {
  accepted: boolean;
  errorCode?: RelayChallengeVerifyErrorCode;
  identity?: RelayIdentityRecord;
};

/**
 * Verifies one signed challenge response and upserts relay identity on success.
 */
export function verifyRelayChallengeResponse(
  args: {
    store: RelayStore;
    publicKeyBase32: string;
    challengeId: string;
    signatureBase64: string;
    nowIso?: string;
  },
): RelayChallengeVerifyResult {
  const normalizedPublicKey = deriveRelayEmailLocalPart({
    publicKeyBase32: args.publicKeyBase32,
  });
  const challenge = readRelayChallenge({
    store: args.store,
    challengeId: args.challengeId,
  });
  if (!challenge) {
    return {
      accepted: false,
      errorCode: 'challenge_not_found',
    };
  }
  if (challenge.publicKeyBase32 !== normalizedPublicKey) {
    return {
      accepted: false,
      errorCode: 'challenge_mismatch',
    };
  }
  if (challenge.usedAt) {
    return {
      accepted: false,
      errorCode: 'challenge_already_used',
    };
  }

  const now = args.nowIso ? new Date(args.nowIso) : new Date();
  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    return {
      accepted: false,
      errorCode: 'challenge_expired',
    };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(args.signatureBase64, 'base64');
  } catch {
    return {
      accepted: false,
      errorCode: 'invalid_signature_encoding',
    };
  }
  if (signature.length === 0) {
    return {
      accepted: false,
      errorCode: 'invalid_signature_encoding',
    };
  }

  const publicKey = publicKeyBase32ToKeyObject({
    publicKeyBase32: normalizedPublicKey,
  });
  const accepted = verify(
    null,
    Buffer.from(challenge.challengeText, 'utf8'),
    publicKey,
    signature,
  );
  if (!accepted) {
    return {
      accepted: false,
      errorCode: 'invalid_signature',
    };
  }

  markRelayChallengeUsed({
    store: args.store,
    challengeId: args.challengeId,
    usedAt: now.toISOString(),
  });
  const upsertedIdentity = upsertRelayIdentity({
    store: args.store,
    identity: {
      publicKeyBase32: normalizedPublicKey,
      emailLocalPart: deriveRelayEmailLocalPart({
        publicKeyBase32: normalizedPublicKey,
      }),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      status: 'active',
    },
  });
  return {
    accepted: true,
    identity: upsertedIdentity,
  };
}
