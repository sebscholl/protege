import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import { createPersona } from '@engine/shared/personas';
import { listResponsibilitiesByPersona } from '@engine/scheduler/storage';
import { parseFrontmatterMarkdown, syncPersonaResponsibilities } from '@engine/scheduler/sync';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let roots: PersonaRoots | undefined;
let db: ProtegeDatabase | undefined;
let personaId = '';
let parseName = '';
let parseEnabled = false;
let firstSyncUpserted = 0;
let firstSyncDisabled = 0;
let secondSyncDisabled = 0;
let enabledCountAfterRemoval = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let repoRootPath = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-scheduler-sync-',
  });
  repoRootPath = workspace.previousCwd;
  tempRootPath = workspace.tempRootPath;
  roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
  const persona = createPersona({
    roots,
    label: 'Scheduler Persona',
  });
  personaId = persona.personaId;
  workspace.writeFile({
    relativePath: join('personas', personaId, 'responsibilities', 'daily-brief.md'),
    payload: [
    '---',
    'name: Daily Brief',
    'schedule: 0 9 * * *',
    'enabled: true',
    '---',
    'Generate a morning brief for me.',
  ].join('\n'),
  });
  workspace.writeFile({
    relativePath: join('personas', personaId, 'responsibilities', 'disabled-task.md'),
    payload: [
    '---',
    'name: Disabled Task',
    'schedule: 0 22 * * *',
    'enabled: false',
    '---',
    'This one is intentionally disabled.',
  ].join('\n'),
  });

  const parsed = parseFrontmatterMarkdown({
    markdown: [
      '---',
      'name: Parse Check',
      'schedule: */5 * * * *',
      'enabled: true',
      '---',
      'hello',
    ].join('\n'),
  });
  parseName = parsed.frontmatter.name;
  parseEnabled = parsed.frontmatter.enabled;

  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(repoRootPath, 'engine', 'shared', 'migrations'),
  });
  const firstSync = syncPersonaResponsibilities({
    db: db as ProtegeDatabase,
    personaId,
    roots,
    nowIso: '2026-02-20T10:00:00.000Z',
  });
  firstSyncUpserted = firstSync.upsertedCount;
  firstSyncDisabled = firstSync.disabledCount;

  unlinkSync(join(tempRootPath, 'personas', personaId, 'responsibilities', 'daily-brief.md'));
  const secondSync = syncPersonaResponsibilities({
    db: db as ProtegeDatabase,
    personaId,
    roots,
    nowIso: '2026-02-20T11:00:00.000Z',
  });
  secondSyncDisabled = secondSync.disabledCount;
  enabledCountAfterRemoval = listResponsibilitiesByPersona({
    db: db as ProtegeDatabase,
    personaId,
  }).filter((item) => item.enabled).length;
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('scheduler sync', () => {
  it('parses required frontmatter fields for responsibility markdown', () => {
    expect([parseName, parseEnabled]).toEqual(['Parse Check', true]);
  });

  it('upserts responsibility files into runtime index rows', () => {
    expect([firstSyncUpserted, firstSyncDisabled]).toEqual([2, 0]);
  });

  it('disables missing indexed responsibilities during reconcile', () => {
    expect(secondSyncDisabled).toBe(1);
  });

  it('retains only explicitly enabled files as enabled after reconcile', () => {
    expect(enabledCountAfterRemoval).toBe(0);
  });
});
