import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseSchedulerArgs, resolvePersonaForScheduler, syncSchedulerAcrossPersonas } from '@engine/cli/scheduler';
import { createPersona } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let parsedAction = '';
let resolvedPrefixPersonaId = '';
let resolvedExactPersonaId = '';
let syncAllSummaryCount = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-scheduler-',
  });
  tempRootPath = workspace.tempRootPath;

  const personaA = createPersona({});
  createPersona({});
  parsedAction = parseSchedulerArgs({
    argv: ['sync'],
  }).action;
  resolvedPrefixPersonaId = resolvePersonaForScheduler({
    selector: personaA.personaId.slice(0, 8),
  }).personaId;
  resolvedExactPersonaId = resolvePersonaForScheduler({
    selector: personaA.personaId,
  }).personaId;
  syncAllSummaryCount = syncSchedulerAcrossPersonas({}).length;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('scheduler cli args', () => {
  it('parses scheduler sync action', () => {
    expect(parsedAction).toBe('sync');
  });

  it('rejects invalid scheduler action usage', () => {
    expect(() => parseSchedulerArgs({ argv: ['start'] })).toThrow('Usage: protege scheduler sync');
  });
});

describe('scheduler persona resolution', () => {
  it('resolves persona by exact id', () => {
    expect(resolvedExactPersonaId.length > 0).toBe(true);
  });

  it('resolves persona by unambiguous id prefix', () => {
    expect(resolvedPrefixPersonaId).toBe(resolvedExactPersonaId);
  });
});

describe('scheduler sync scope', () => {
  it('syncs all personas when selector is omitted', () => {
    expect(syncAllSummaryCount).toBe(2);
  });
});
