import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Represents persisted persona metadata.
 */
export type PersonaMetadata = {
  personaId: string;
  publicKeyBase32: string;
  emailLocalPart: string;
  createdAt: string;
  label?: string;
};

/**
 * Represents root paths used by persona config and memory storage.
 */
export type PersonaRoots = {
  personasDirPath: string;
  memoryDirPath: string;
};

const ACTIVE_PERSONA_FILE_NAME = '.active-persona';

/**
 * Returns default repository paths for persona config and memory roots.
 */
export function resolveDefaultPersonaRoots(): PersonaRoots {
  return {
    personasDirPath: join(process.cwd(), 'personas'),
    memoryDirPath: join(process.cwd(), 'memory'),
  };
}

/**
 * Returns the default pointer-file path for the active persona id.
 */
export function resolveActivePersonaPointerPath(
  args: {
    roots?: PersonaRoots;
  } = {},
): string {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  return join(roots.personasDirPath, ACTIVE_PERSONA_FILE_NAME);
}

/**
 * Returns the config directory path for one persona id.
 */
export function resolvePersonaConfigDirPath(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): string {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  return join(roots.personasDirPath, args.personaId);
}

/**
 * Returns the memory directory path for one persona id.
 */
export function resolvePersonaMemoryDirPath(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): string {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  return join(roots.memoryDirPath, args.personaId);
}

/**
 * Returns paths for one persona's temporal db, active memory, logs, and attachments.
 */
export function resolvePersonaMemoryPaths(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): {
  temporalDbPath: string;
  activeMemoryPath: string;
  logsDirPath: string;
  attachmentsDirPath: string;
} {
  const memoryDirPath = resolvePersonaMemoryDirPath({
    personaId: args.personaId,
    roots: args.roots,
  });

  return {
    temporalDbPath: join(memoryDirPath, 'temporal.db'),
    activeMemoryPath: join(memoryDirPath, 'active.md'),
    logsDirPath: join(memoryDirPath, 'logs'),
    attachmentsDirPath: join(memoryDirPath, 'attachments'),
  };
}

/**
 * Creates one new ed25519 persona and materializes config + memory namespace.
 */
export function createPersona(
  args: {
    label?: string;
    roots?: PersonaRoots;
    setActive?: boolean;
  } = {},
): PersonaMetadata {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  mkdirSync(roots.personasDirPath, { recursive: true });
  mkdirSync(roots.memoryDirPath, { recursive: true });

  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyDer = keyPair.publicKey.export({
    type: 'spki',
    format: 'der',
  }) as Buffer;
  const rawPublicKey = extractEd25519RawPublicKey({ spkiDer: publicKeyDer });
  const publicKeyBase32 = base32Encode({ value: rawPublicKey });
  const personaId = derivePersonaId({ publicKeyBase32 });

  const configDirPath = resolvePersonaConfigDirPath({ personaId, roots });
  if (existsSync(configDirPath)) {
    throw new Error('Persona id collision encountered. Regenerate persona keypair.');
  }

  const memoryPaths = resolvePersonaMemoryPaths({ personaId, roots });
  mkdirSync(configDirPath, { recursive: true });
  mkdirSync(memoryPaths.logsDirPath, { recursive: true });
  mkdirSync(memoryPaths.attachmentsDirPath, { recursive: true });

  const privateKeyPem = keyPair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  writeFileSync(join(configDirPath, 'passport.key'), privateKeyPem);
  writeFileSync(memoryPaths.activeMemoryPath, '# Active Memory\n');

  const metadata: PersonaMetadata = {
    personaId,
    publicKeyBase32,
    emailLocalPart: publicKeyBase32,
    createdAt: new Date().toISOString(),
    label: args.label,
  };
  writeFileSync(
    join(configDirPath, 'persona.json'),
    JSON.stringify(metadata, null, 2),
  );

  if (args.setActive) {
    setActivePersona({ personaId, roots });
  }

  return metadata;
}

/**
 * Lists all known personas by reading persona metadata files on disk.
 */
export function listPersonas(
  args: {
    roots?: PersonaRoots;
  } = {},
): PersonaMetadata[] {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  if (!existsSync(roots.personasDirPath)) {
    return [];
  }

  const items = readdirSync(roots.personasDirPath, { withFileTypes: true });
  return items
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPersonaMetadata({ personaId: entry.name, roots }));
}

/**
 * Reads one persona metadata file and returns the parsed record.
 */
export function readPersonaMetadata(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): PersonaMetadata {
  const configDirPath = resolvePersonaConfigDirPath({
    personaId: args.personaId,
    roots: args.roots,
  });
  const text = readFileSync(join(configDirPath, 'persona.json'), 'utf8');
  return JSON.parse(text) as PersonaMetadata;
}

/**
 * Resolves one persona by full public-key local-part from recipient addressing.
 */
export function resolvePersonaByEmailLocalPart(
  args: {
    emailLocalPart: string;
    roots?: PersonaRoots;
  },
): PersonaMetadata | undefined {
  const personas = listPersonas({ roots: args.roots });
  return personas.find((persona) => persona.emailLocalPart === args.emailLocalPart);
}

/**
 * Writes the active persona pointer file.
 */
export function setActivePersona(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): void {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  const configDirPath = resolvePersonaConfigDirPath({
    personaId: args.personaId,
    roots,
  });
  if (!existsSync(configDirPath)) {
    throw new Error(`Persona not found: ${args.personaId}`);
  }

  writeFileSync(resolveActivePersonaPointerPath({ roots }), args.personaId);
}

/**
 * Reads the active persona id pointer if one has been selected.
 */
export function readActivePersonaId(
  args: {
    roots?: PersonaRoots;
  } = {},
): string | undefined {
  const pointerPath = resolveActivePersonaPointerPath({ roots: args.roots });
  if (!existsSync(pointerPath)) {
    return undefined;
  }

  const personaId = readFileSync(pointerPath, 'utf8').trim();
  return personaId.length > 0 ? personaId : undefined;
}

/**
 * Deletes one persona config and memory namespace with hard-delete semantics.
 */
export function deletePersona(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): void {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  const configDirPath = resolvePersonaConfigDirPath({
    personaId: args.personaId,
    roots,
  });
  const memoryDirPath = resolvePersonaMemoryDirPath({
    personaId: args.personaId,
    roots,
  });

  rmSync(configDirPath, { recursive: true, force: true });
  rmSync(memoryDirPath, { recursive: true, force: true });

  const activePersonaId = readActivePersonaId({ roots });
  if (activePersonaId === args.personaId) {
    const pointerPath = resolveActivePersonaPointerPath({ roots });
    if (existsSync(pointerPath)) {
      unlinkSync(pointerPath);
    }
  }
}

/**
 * Derives an 8-byte discriminator id from full base32 public key text.
 */
export function derivePersonaId(
  args: {
    publicKeyBase32: string;
  },
): string {
  return createHash('sha256')
    .update(args.publicKeyBase32)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extracts the 32-byte raw ed25519 public key from SPKI DER bytes.
 */
export function extractEd25519RawPublicKey(
  args: {
    spkiDer: Buffer;
  },
): Buffer {
  const expectedPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  if (args.spkiDer.length !== expectedPrefix.length + 32) {
    throw new Error('Unexpected ed25519 SPKI length while extracting public key bytes.');
  }

  const prefix = args.spkiDer.subarray(0, expectedPrefix.length);
  if (!prefix.equals(expectedPrefix)) {
    throw new Error('Unexpected ed25519 SPKI prefix while extracting public key bytes.');
  }

  return args.spkiDer.subarray(expectedPrefix.length);
}

/**
 * Encodes binary input bytes into lowercase base32 text without padding.
 */
export function base32Encode(
  args: {
    value: Buffer;
  },
): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let bitBuffer = 0;
  let output = '';

  for (const byte of args.value) {
    bitBuffer = (bitBuffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      const index = (bitBuffer >>> (bits - 5)) & 0b11111;
      output += alphabet[index];
      bits -= 5;
    }
  }

  if (bits > 0) {
    const index = (bitBuffer << (5 - bits)) & 0b11111;
    output += alphabet[index];
  }

  return output;
}

/**
 * Returns recipient local-part text from one full email address.
 */
export function extractEmailLocalPart(
  args: {
    emailAddress: string;
  },
): string {
  const atIndex = args.emailAddress.indexOf('@');
  return atIndex >= 0 ? args.emailAddress.slice(0, atIndex) : args.emailAddress;
}
