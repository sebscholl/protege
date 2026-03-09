import type { PersonaMetadata, PersonaRoots } from '@engine/shared/personas';

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePersonaIdFromSession } from '@engine/gateway/index';
import { createPersona, resolveDefaultPersonaRoots, resolvePersonaConfigDirPath } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let createdPersona: PersonaMetadata;
let resolvedId = '';
let resolvedAliasId = '';
let resolvedAliasPlusId = '';
let resolvedAliasPlusBareId = '';
let unresolvedId: string | undefined;
let wrongDomainAliasId: string | undefined;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-persona-routing-',
  });

  const roots: PersonaRoots = resolveDefaultPersonaRoots();
  createdPersona = createPersona({ roots });
  const personaConfigPath = join(
    resolvePersonaConfigDirPath({
      personaId: createdPersona.personaId,
      roots,
    }),
    'persona.json',
  );
  const personaMetadata = JSON.parse(readFileSync(personaConfigPath, 'utf8')) as PersonaMetadata;
  writeFileSync(personaConfigPath, JSON.stringify({
    ...personaMetadata,
    aliases: ['charlie'],
  }, null, 2));

  resolvedId = resolvePersonaIdFromSession({
    recipientAddress: `${createdPersona.emailLocalPart}@relay-protege-mail.com`,
    mailDomain: 'relay-protege-mail.com',
  }) ?? '';
  resolvedAliasId = resolvePersonaIdFromSession({
    recipientAddress: 'charlie@localhost',
    mailDomain: 'localhost',
  }) ?? '';
  resolvedAliasPlusId = resolvePersonaIdFromSession({
    recipientAddress: 'charlie+123@localhost',
    mailDomain: 'localhost',
  }) ?? '';
  resolvedAliasPlusBareId = resolvePersonaIdFromSession({
    recipientAddress: 'charlie+123',
    mailDomain: 'localhost',
  }) ?? '';
  unresolvedId = resolvePersonaIdFromSession({
    recipientAddress: 'unknown@example.com',
    mailDomain: 'localhost',
  });
  wrongDomainAliasId = resolvePersonaIdFromSession({
    recipientAddress: 'charlie@anything.com',
    mailDomain: 'localhost',
  });
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway persona recipient routing', () => {
  it('maps full public-key recipient local-part to local persona id', () => {
    expect(resolvedId).toBe(createdPersona.personaId);
  });

  it('maps alias recipient local-part to local persona id', () => {
    expect(resolvedAliasId).toBe(createdPersona.personaId);
  });

  it('maps plus-addressed alias recipients to local persona id', () => {
    expect(resolvedAliasPlusId).toBe(createdPersona.personaId);
  });

  it('maps domainless plus-addressed alias recipients using mailDomain fallback', () => {
    expect(resolvedAliasPlusBareId).toBe(createdPersona.personaId);
  });

  it('returns undefined for unknown recipient local-parts', () => {
    expect(unresolvedId).toBeUndefined();
  });

  it('rejects alias recipients on non-configured domains', () => {
    expect(wrongDomainAliasId).toBeUndefined();
  });
});
