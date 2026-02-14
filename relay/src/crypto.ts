import type { KeyObject } from 'node:crypto';

import { createPublicKey } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Encodes bytes into lowercase base32 without padding.
 */
export function base32Encode(
  args: {
    value: Buffer;
  },
): string {
  let bits = 0;
  let bitBuffer = 0;
  let output = '';
  for (const byte of args.value) {
    bitBuffer = (bitBuffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      const index = (bitBuffer >>> (bits - 5)) & 0b11111;
      output += BASE32_ALPHABET[index];
      bits -= 5;
    }
  }
  if (bits > 0) {
    const index = (bitBuffer << (5 - bits)) & 0b11111;
    output += BASE32_ALPHABET[index];
  }

  return output;
}

/**
 * Decodes lowercase base32 without padding into bytes.
 */
export function base32Decode(
  args: {
    value: string;
  },
): Buffer {
  const normalized = args.value.trim().toLowerCase();
  let bits = 0;
  let bitBuffer = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base32 character encountered.');
    }

    bitBuffer = (bitBuffer << 5) | index;
    bits += 5;
    while (bits >= 8) {
      output.push((bitBuffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Extracts raw ed25519 public key bytes from SPKI DER encoding.
 */
export function extractEd25519RawPublicKey(
  args: {
    spkiDer: Buffer;
  },
): Buffer {
  if (args.spkiDer.length !== ED25519_SPKI_PREFIX.length + 32) {
    throw new Error('Unexpected ed25519 SPKI length while extracting relay public key bytes.');
  }

  const prefix = args.spkiDer.subarray(0, ED25519_SPKI_PREFIX.length);
  if (!prefix.equals(ED25519_SPKI_PREFIX)) {
    throw new Error('Unexpected ed25519 SPKI prefix while extracting relay public key bytes.');
  }

  return args.spkiDer.subarray(ED25519_SPKI_PREFIX.length);
}

/**
 * Converts one base32 public key identity into a Node.js KeyObject.
 */
export function publicKeyBase32ToKeyObject(
  args: {
    publicKeyBase32: string;
  },
): KeyObject {
  const raw = base32Decode({
    value: args.publicKeyBase32,
  });
  if (raw.length !== 32) {
    throw new Error('Relay public key must decode to 32 bytes for ed25519.');
  }

  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({
    key: spkiDer,
    format: 'der',
    type: 'spki',
  });
}
