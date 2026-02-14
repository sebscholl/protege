import type { KeyObject } from 'node:crypto';

import { base32Encode, extractEd25519RawPublicKey } from '@relay/src/crypto';

/**
 * Converts one ed25519 public key object into lowercase base32 identity text.
 */
export function toPublicKeyBase32(
  args: {
    publicKey: KeyObject;
  },
): string {
  const publicKeyDer = args.publicKey.export({
    type: 'spki',
    format: 'der',
  }) as Buffer;
  const raw = extractEd25519RawPublicKey({
    spkiDer: publicKeyDer,
  });
  return base32Encode({
    value: raw,
  });
}
