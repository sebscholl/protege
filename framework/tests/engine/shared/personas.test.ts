import type { PersonaMetadata, PersonaRoots } from '@engine/shared/personas';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPersona,
  deletePersona,
  derivePersonaId,
  extractEmailLocalPart,
  listPersonas,
  normalizePersonaAliases,
  resolvePersonaByRecipientAddress,
  resolvePersonaByEmailLocalPart,
  resolvePersonaConfigDirPath,
  resolvePersonaMemoryPaths,
} from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let roots: PersonaRoots;
let createdPersona: PersonaMetadata;
let listedPersonasCount = 0;
let resolvedPersonaId = '';
let personaPassportExists = false;
let personaActiveMemoryExists = false;
let personaKnowledgeDirExists = false;
let personaKnowledgeReadmeExists = false;
let personaKnowledgeIndexExists = false;
let personaResponsibilitiesDirExists = false;
let personaResponsibilitiesReadmeExists = false;
let personaPromptExists = false;
let personaPromptContainsTemplateHeading = false;
let extractedLocalPart = '';
let derivedPersonaIdLength = 0;
let resolvedAliasPersonaId = '';
let normalizedAliasCount = 0;
let aliasCollisionMessage = '';
let secondPersona: PersonaMetadata;
let recipientAliasResolvedPersonaId = '';
let recipientPlusAliasResolvedPersonaId = '';
let barePlusAliasResolvedPersonaId = '';
let wrongDomainRecipientResolved = false;
let createdPersonaDomain = '';
let createdPersonaDisplayName = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-personas-',
    chdir: false,
  });
  roots = {
    personasDirPath: join(workspace.tempRootPath, 'personas'),
    memoryDirPath: join(workspace.tempRootPath, 'memory'),
  };
  workspace.writeFile({
    relativePath: 'configs/gateway.json',
    payload: {
      mode: 'local',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'mail.protege.bot',
      relay: {
        enabled: false,
        relayWsUrl: 'ws://127.0.0.1:8080/ws',
        reconnectBaseDelayMs: 250,
        reconnectMaxDelayMs: 8000,
        heartbeatTimeoutMs: 30000,
      },
      transport: {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
      },
      attachmentLimits: {
        maxTotalAttachmentBytes: 5000000,
      },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 200,
      },
    },
  });

  createdPersona = createPersona({ roots, label: 'Test Persona' });
  createdPersonaDomain = createdPersona.emailAddress.split('@')[1] ?? '';
  createdPersonaDisplayName = createdPersona.displayName ?? '';
  listedPersonasCount = listPersonas({ roots }).length;
  resolvedPersonaId = resolvePersonaByEmailLocalPart({
    emailLocalPart: createdPersona.emailLocalPart,
    roots,
  })?.personaId ?? '';

  const configDirPath = resolvePersonaConfigDirPath({
    personaId: createdPersona.personaId,
    roots,
  });
  const memoryPaths = resolvePersonaMemoryPaths({
    personaId: createdPersona.personaId,
    roots,
  });

  personaPassportExists = existsSync(join(configDirPath, 'passport.key'));
  personaActiveMemoryExists = existsSync(memoryPaths.activeMemoryPath);
  personaKnowledgeDirExists = existsSync(join(configDirPath, 'knowledge'));
  personaKnowledgeReadmeExists = existsSync(join(configDirPath, 'knowledge', 'README.md'));
  personaKnowledgeIndexExists = existsSync(join(configDirPath, 'knowledge', 'CONTENT.md'));
  personaResponsibilitiesDirExists = existsSync(join(configDirPath, 'responsibilities'));
  personaResponsibilitiesReadmeExists = existsSync(join(configDirPath, 'responsibilities', 'README.md'));
  personaPromptExists = existsSync(join(configDirPath, 'PERSONA.md'));
  personaPromptContainsTemplateHeading = readFileSync(join(configDirPath, 'PERSONA.md'), 'utf8')
    .includes('# Persona');

  extractedLocalPart = extractEmailLocalPart({
    emailAddress: `${createdPersona.emailLocalPart}@relay-protege-mail.com`,
  });
  derivedPersonaIdLength = derivePersonaId({
    publicKeyBase32: createdPersona.publicKeyBase32,
  }).length;

  const createdPersonaConfigPath = join(
    resolvePersonaConfigDirPath({
      personaId: createdPersona.personaId,
      roots,
    }),
    'persona.json',
  );
  const createdPersonaMetadata = JSON.parse(readFileSync(createdPersonaConfigPath, 'utf8')) as PersonaMetadata;
  writeFileSync(createdPersonaConfigPath, JSON.stringify({
    ...createdPersonaMetadata,
    aliases: ['Charlie', 'charlie@localhost', ' CHARLIE '],
  }, null, 2));

  resolvedAliasPersonaId = resolvePersonaByEmailLocalPart({
    emailLocalPart: 'charlie',
    roots,
  })?.personaId ?? '';

  normalizedAliasCount = normalizePersonaAliases({
    aliases: ['Charlie', 'charlie@localhost', ' CHARLIE '],
  }).length;
  recipientAliasResolvedPersonaId = resolvePersonaByRecipientAddress({
    recipientAddress: 'charlie@localhost',
    mailDomain: 'localhost',
    roots,
  })?.personaId ?? '';
  recipientPlusAliasResolvedPersonaId = resolvePersonaByRecipientAddress({
    recipientAddress: 'charlie+123@localhost',
    mailDomain: 'localhost',
    roots,
  })?.personaId ?? '';
  barePlusAliasResolvedPersonaId = resolvePersonaByRecipientAddress({
    recipientAddress: 'charlie+123',
    mailDomain: 'localhost',
    roots,
  })?.personaId ?? '';
  wrongDomainRecipientResolved = Boolean(resolvePersonaByRecipientAddress({
    recipientAddress: 'charlie@anything.com',
    mailDomain: 'localhost',
    roots,
  }));

  secondPersona = createPersona({ roots, label: 'Second Persona' });
  const secondPersonaConfigPath = join(
    resolvePersonaConfigDirPath({
      personaId: secondPersona.personaId,
      roots,
    }),
    'persona.json',
  );
  const secondPersonaMetadata = JSON.parse(readFileSync(secondPersonaConfigPath, 'utf8')) as PersonaMetadata;
  writeFileSync(secondPersonaConfigPath, JSON.stringify({
    ...secondPersonaMetadata,
    aliases: ['charlie'],
  }, null, 2));

  try {
    resolvePersonaByEmailLocalPart({
      emailLocalPart: 'charlie',
      roots,
    });
  } catch (error) {
    aliasCollisionMessage = (error as Error).message;
  }
});

afterAll((): void => {
  if (secondPersona?.personaId) {
    deletePersona({ personaId: secondPersona.personaId, roots });
  }
  if (createdPersona?.personaId) {
    deletePersona({ personaId: createdPersona.personaId, roots });
  }
  workspace.cleanup();
});

describe('shared persona model', () => {
  it('creates one persona metadata record with deterministic ids', () => {
    expect(createdPersona.personaId.length).toBe(16);
  });

  it('defaults persona email domain from gateway mailDomain config', () => {
    expect(createdPersonaDomain).toBe('mail.protege.bot');
  });

  it('stores displayName on persona metadata', () => {
    expect(createdPersonaDisplayName).toBe('Test Persona');
  });

  it('materializes passport.key in persona config namespace', () => {
    expect(personaPassportExists).toBe(true);
  });

  it('materializes active.md in persona memory namespace', () => {
    expect(personaActiveMemoryExists).toBe(true);
  });

  it('materializes persona knowledge directory in config namespace', () => {
    expect(personaKnowledgeDirExists).toBe(true);
  });

  it('materializes persona knowledge README in config namespace', () => {
    expect(personaKnowledgeReadmeExists).toBe(true);
  });

  it('materializes persona knowledge CONTENT index in config namespace', () => {
    expect(personaKnowledgeIndexExists).toBe(true);
  });

  it('materializes persona responsibilities directory in config namespace', () => {
    expect(personaResponsibilitiesDirExists).toBe(true);
  });

  it('materializes persona responsibilities README in config namespace', () => {
    expect(personaResponsibilitiesReadmeExists).toBe(true);
  });

  it('materializes PERSONA.md from the persona template directory', () => {
    expect(personaPromptExists).toBe(true);
  });

  it('copies template persona prompt content into PERSONA.md', () => {
    expect(personaPromptContainsTemplateHeading).toBe(true);
  });

  it('lists created personas from config directory metadata', () => {
    expect(listedPersonasCount).toBe(1);
  });

  it('resolves persona by full public-key email local-part', () => {
    expect(resolvedPersonaId).toBe(createdPersona.personaId);
  });

  it('resolves persona by configured alias local-part', () => {
    expect(resolvedAliasPersonaId).toBe(createdPersona.personaId);
  });

  it('normalizes and deduplicates alias values', () => {
    expect(normalizedAliasCount).toBe(1);
  });

  it('defaults non-qualified aliases to configured mailDomain in recipient resolution', () => {
    expect(recipientAliasResolvedPersonaId).toBe(createdPersona.personaId);
  });

  it('resolves plus-addressed aliases to the base alias mailbox', () => {
    expect(recipientPlusAliasResolvedPersonaId).toBe(createdPersona.personaId);
  });

  it('resolves domainless plus-addressed aliases using configured mailDomain fallback', () => {
    expect(barePlusAliasResolvedPersonaId).toBe(createdPersona.personaId);
  });

  it('rejects recipients whose domain does not match configured mailDomain', () => {
    expect(wrongDomainRecipientResolved).toBe(false);
  });

  it('rejects alias collisions across personas', () => {
    expect(aliasCollisionMessage.includes('alias collision')).toBe(true);
  });

  it('extracts local-part from full recipient addresses', () => {
    expect(extractedLocalPart).toBe(createdPersona.emailLocalPart);
  });

  it('derives 8-byte discriminator ids as 16-char hex strings', () => {
    expect(derivedPersonaIdLength).toBe(16);
  });
});
