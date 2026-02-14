import type { PersonaMetadata, PersonaRoots } from '@engine/shared/personas';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePersonaIdFromSession } from '@engine/gateway/index';
import { createPersona, resolveDefaultPersonaRoots } from '@engine/shared/personas';

let tempRootPath = '';
let createdPersona: PersonaMetadata;
let resolvedId = '';
let unresolvedId: string | undefined;
let previousCwd = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-persona-routing-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  const roots: PersonaRoots = resolveDefaultPersonaRoots();
  createdPersona = createPersona({ roots });

  resolvedId = resolvePersonaIdFromSession({
    recipientAddress: `${createdPersona.emailLocalPart}@relay-protege-mail.com`,
  }) ?? '';
  unresolvedId = resolvePersonaIdFromSession({
    recipientAddress: 'unknown@example.com',
  });
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway persona recipient routing', () => {
  it('maps full public-key recipient local-part to local persona id', () => {
    expect(resolvedId).toBe(createdPersona.personaId);
  });

  it('returns undefined for unknown recipient local-parts', () => {
    expect(unresolvedId).toBeUndefined();
  });
});
