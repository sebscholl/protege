import type { PersonaMetadata, PersonaRoots } from '@engine/shared/personas';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePersonaIdFromSession } from '@engine/gateway/index';
import { createPersona, resolveDefaultPersonaRoots } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let createdPersona: PersonaMetadata;
let resolvedId = '';
let unresolvedId: string | undefined;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-persona-routing-',
  });

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
  workspace.cleanup();
});

describe('gateway persona recipient routing', () => {
  it('maps full public-key recipient local-part to local persona id', () => {
    expect(resolvedId).toBe(createdPersona.personaId);
  });

  it('returns undefined for unknown recipient local-parts', () => {
    expect(unresolvedId).toBeUndefined();
  });
});
