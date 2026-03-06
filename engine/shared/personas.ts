import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
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
  emailAddress: string;
  createdAt: string;
  displayName?: string;
  label?: string;
  aliases?: string[];
};

/**
 * Represents root paths used by persona config and memory storage.
 */
export type PersonaRoots = {
  personasDirPath: string;
  memoryDirPath: string;
};

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
    displayName?: string;
    label?: string;
    roots?: PersonaRoots;
    emailDomain?: string;
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

  const effectiveEmailDomain = args.emailDomain
    ?? readDefaultPersonaEmailDomain({
      workspaceRootPath: args.roots ? join(args.roots.personasDirPath, '..') : undefined,
    });
  const metadata: PersonaMetadata = {
    personaId,
    publicKeyBase32,
    emailLocalPart: publicKeyBase32,
    emailAddress: `${publicKeyBase32}@${effectiveEmailDomain}`,
    createdAt: new Date().toISOString(),
    displayName: args.displayName ?? args.label,
  };
  writeFileSync(
    join(configDirPath, 'persona.json'),
    JSON.stringify(metadata, null, 2),
  );

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
  const parsed = JSON.parse(text) as PersonaMetadata;
  const metadata: PersonaMetadata = {
    ...parsed,
    displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
      ? parsed.displayName.trim()
      : typeof parsed.label === 'string' && parsed.label.trim().length > 0
        ? parsed.label.trim()
        : undefined,
    label: undefined,
    aliases: normalizePersonaAliases({
      aliases: parsed.aliases,
    }),
  };
  if (typeof metadata.emailAddress === 'string' && metadata.emailAddress.trim().length > 0) {
    return metadata;
  }

  return {
    ...metadata,
    emailAddress: `${metadata.emailLocalPart}@localhost`,
  };
}

/**
 * Reads the default persona email domain from `configs/gateway.json`.
 */
export function readDefaultPersonaEmailDomain(
  args: {
    workspaceRootPath?: string;
  } = {},
): string {
  const gatewayConfigPath = join(args.workspaceRootPath ?? process.cwd(), 'configs', 'gateway.json');
  if (!existsSync(gatewayConfigPath)) {
    return 'localhost';
  }

  try {
    const parsed = JSON.parse(readFileSync(gatewayConfigPath, 'utf8')) as {
      mailDomain?: unknown;
    };
    if (typeof parsed.mailDomain === 'string' && parsed.mailDomain.trim().length > 0) {
      return parsed.mailDomain.trim().toLowerCase();
    }
  } catch {
    return 'localhost';
  }

  return 'localhost';
}

/**
 * Resolves one persona by canonical or alias local-part from recipient addressing.
 */
export function resolvePersonaByEmailLocalPart(
  args: {
    emailLocalPart: string;
    roots?: PersonaRoots;
  },
): PersonaMetadata | undefined {
  const normalizedLocalPart = normalizePersonaLocalPart({
    value: args.emailLocalPart,
  });
  const personas = listPersonas({ roots: args.roots });
  const rootMatch = personas.find((persona) => normalizePersonaLocalPart({
    value: persona.emailLocalPart,
  }) === normalizedLocalPart);
  if (rootMatch) {
    return rootMatch;
  }

  const aliasMatches = personas.filter((persona) => (persona.aliases ?? []).some((alias) => normalizePersonaLocalPart({
    value: alias,
  }) === normalizedLocalPart));
  if (aliasMatches.length > 1) {
    throw new Error(`Persona alias collision for local-part "${normalizedLocalPart}".`);
  }

  return aliasMatches[0];
}

/**
 * Resolves one persona by full recipient address with strict configured-domain matching.
 */
export function resolvePersonaByRecipientAddress(
  args: {
    recipientAddress: string;
    mailDomain: string;
    roots?: PersonaRoots;
  },
): PersonaMetadata | undefined {
  const normalizedRecipientAddress = normalizePersonaAddress({
    value: args.recipientAddress,
  });
  const effectiveRecipientAddress = normalizedRecipientAddress.includes('@')
    ? normalizedRecipientAddress
    : `${normalizePersonaLocalPart({ value: normalizedRecipientAddress })}@${normalizePersonaDomain({ value: args.mailDomain })}`;
  const recipientDomain = extractEmailDomain({
    emailAddress: effectiveRecipientAddress,
  });
  if (recipientDomain !== normalizePersonaDomain({ value: args.mailDomain })) {
    return undefined;
  }

  const personas = listPersonas({ roots: args.roots });
  const rootMatch = personas.find((persona) => normalizePersonaAddress({
    value: persona.emailAddress,
  }) === effectiveRecipientAddress);
  if (rootMatch) {
    return rootMatch;
  }

  const recipientLocalPart = normalizePersonaLocalPart({
    value: effectiveRecipientAddress,
  });
  const rootLocalPartMatch = personas.find((persona) => normalizePersonaLocalPart({
    value: persona.emailLocalPart,
  }) === recipientLocalPart);
  if (rootLocalPartMatch) {
    return rootLocalPartMatch;
  }

  const aliasMatches = personas.filter((persona) => (persona.aliases ?? []).some((alias) => normalizePersonaLocalPart({
    value: normalizePersonaAliasAddress({
    alias,
    mailDomain: args.mailDomain,
  }),
  }) === recipientLocalPart));
  if (aliasMatches.length > 1) {
    throw new Error(`Persona alias collision for recipient "${effectiveRecipientAddress}".`);
  }

  return aliasMatches[0];
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
}

/**
 * Updates one persona mailbox address and persists metadata changes.
 */
export function updatePersonaEmailAddress(
  args: {
    personaId: string;
    emailAddress: string;
    roots?: PersonaRoots;
  },
): PersonaMetadata {
  const configDirPath = resolvePersonaConfigDirPath({
    personaId: args.personaId,
    roots: args.roots,
  });
  const metadata = readPersonaMetadata({
    personaId: args.personaId,
    roots: args.roots,
  });
  const updated: PersonaMetadata = {
    ...metadata,
    emailAddress: args.emailAddress,
  };
  writeFileSync(
    join(configDirPath, 'persona.json'),
    JSON.stringify(updated, null, 2),
  );
  return updated;
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

/**
 * Normalizes one persona local-part candidate to lowercase trimmed text.
 */
export function normalizePersonaLocalPart(
  args: {
    value: string;
  },
): string {
  return stripPlusAddressTag({
    localPart: extractEmailLocalPart({
    emailAddress: args.value.trim().toLowerCase(),
    }),
  });
}

/**
 * Normalizes one optional alias list to deduplicated lowercase local-parts.
 */
export function normalizePersonaAliases(
  args: {
    aliases: unknown;
  },
): string[] {
  if (!Array.isArray(args.aliases)) {
    return [];
  }

  const normalized = args.aliases
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizePersonaLocalPart({ value: entry }))
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized));
}

/**
 * Normalizes one email/domain string to lowercase trimmed text.
 */
export function normalizePersonaDomain(
  args: {
    value: string;
  },
): string {
  return args.value.trim().toLowerCase();
}

/**
 * Normalizes one full email address candidate to lowercase trimmed text.
 */
export function normalizePersonaAddress(
  args: {
    value: string;
  },
): string {
  return args.value.trim().toLowerCase();
}

/**
 * Expands one alias into one fully-qualified address using configured mail domain fallback.
 */
export function normalizePersonaAliasAddress(
  args: {
    alias: string;
    mailDomain: string;
  },
): string {
  const normalizedAlias = normalizePersonaAddress({
    value: args.alias,
  });
  if (normalizedAlias.includes('@')) {
    return normalizedAlias;
  }

  return `${normalizedAlias}@${normalizePersonaDomain({ value: args.mailDomain })}`;
}

/**
 * Returns recipient domain text from one full email address.
 */
export function extractEmailDomain(
  args: {
    emailAddress: string;
  },
): string {
  const atIndex = args.emailAddress.indexOf('@');
  if (atIndex < 0) {
    return '';
  }

  return args.emailAddress.slice(atIndex + 1).trim().toLowerCase();
}

/**
 * Removes one plus-address tag suffix from one local-part while keeping base mailbox identity.
 */
export function stripPlusAddressTag(
  args: {
    localPart: string;
  },
): string {
  const plusIndex = args.localPart.indexOf('+');
  return plusIndex >= 0 ? args.localPart.slice(0, plusIndex) : args.localPart;
}
