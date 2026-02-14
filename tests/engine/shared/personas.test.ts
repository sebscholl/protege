import type { PersonaMetadata, PersonaRoots } from '@engine/shared/personas';

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPersona,
  deletePersona,
  derivePersonaId,
  extractEmailLocalPart,
  listPersonas,
  readActivePersonaId,
  resolveActivePersonaPointerPath,
  resolvePersonaByEmailLocalPart,
  resolvePersonaConfigDirPath,
  resolvePersonaMemoryPaths,
  setActivePersona,
} from '@engine/shared/personas';

let tempRootPath = '';
let roots: PersonaRoots;
let createdPersona: PersonaMetadata;
let listedPersonasCount = 0;
let resolvedPersonaId = '';
let activePersonaId = '';
let personaPassportExists = false;
let personaActiveMemoryExists = false;
let extractedLocalPart = '';
let derivedPersonaIdLength = 0;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-personas-'));
  roots = {
    personasConfigDirPath: join(tempRootPath, 'config', 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };

  createdPersona = createPersona({ roots, label: 'Test Persona', setActive: true });
  listedPersonasCount = listPersonas({ roots }).length;
  resolvedPersonaId = resolvePersonaByEmailLocalPart({
    emailLocalPart: createdPersona.emailLocalPart,
    roots,
  })?.personaId ?? '';

  activePersonaId = readActivePersonaId({ roots }) ?? '';

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

  extractedLocalPart = extractEmailLocalPart({
    emailAddress: `${createdPersona.emailLocalPart}@relay-protege-mail.com`,
  });
  derivedPersonaIdLength = derivePersonaId({
    publicKeyBase32: createdPersona.publicKeyBase32,
  }).length;

  setActivePersona({ personaId: createdPersona.personaId, roots });
});

afterAll((): void => {
  const pointerPath = resolveActivePersonaPointerPath({ roots });
  if (existsSync(pointerPath)) {
    rmSync(pointerPath, { force: true });
  }

  deletePersona({ personaId: createdPersona.personaId, roots });
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('shared persona model', () => {
  it('creates one persona metadata record with deterministic ids', () => {
    expect(createdPersona.personaId.length).toBe(16);
  });

  it('materializes passport.key in persona config namespace', () => {
    expect(personaPassportExists).toBe(true);
  });

  it('materializes active.md in persona memory namespace', () => {
    expect(personaActiveMemoryExists).toBe(true);
  });

  it('lists created personas from config directory metadata', () => {
    expect(listedPersonasCount).toBe(1);
  });

  it('resolves persona by full public-key email local-part', () => {
    expect(resolvedPersonaId).toBe(createdPersona.personaId);
  });

  it('persists and reads active persona pointer id', () => {
    expect(activePersonaId).toBe(createdPersona.personaId);
  });

  it('extracts local-part from full recipient addresses', () => {
    expect(extractedLocalPart).toBe(createdPersona.emailLocalPart);
  });

  it('derives 8-byte discriminator ids as 16-char hex strings', () => {
    expect(derivedPersonaIdLength).toBe(16);
  });
});
