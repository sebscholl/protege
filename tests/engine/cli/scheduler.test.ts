import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseSchedulerArgs, resolvePersonaForScheduler, syncSchedulerAcrossPersonas } from '@engine/cli/scheduler';
import { createPersona } from '@engine/shared/personas';

let tempRootPath = '';
let previousCwd = '';
let parsedAction = '';
let resolvedPrefixPersonaId = '';
let resolvedExactPersonaId = '';
let syncAllSummaryCount = 0;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-scheduler-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);
  mkdirSync(join(tempRootPath, 'personas'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });

  const personaA = createPersona({
    setActive: true,
  });
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
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
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
