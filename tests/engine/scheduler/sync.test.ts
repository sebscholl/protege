import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import { createPersona } from '@engine/shared/personas';
import { listResponsibilitiesByPersona } from '@engine/scheduler/storage';
import { parseFrontmatterMarkdown, syncPersonaResponsibilities } from '@engine/scheduler/sync';

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

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-scheduler-sync-'));
  roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
  mkdirSync(roots.personasDirPath, { recursive: true });
  mkdirSync(roots.memoryDirPath, { recursive: true });
  const persona = createPersona({
    roots,
    setActive: true,
    label: 'Scheduler Persona',
  });
  personaId = persona.personaId;
  const responsibilitiesDirPath = join(roots.personasDirPath, personaId, 'responsibilities');
  mkdirSync(responsibilitiesDirPath, { recursive: true });
  writeFileSync(join(responsibilitiesDirPath, 'daily-brief.md'), [
    '---',
    'name: Daily Brief',
    'schedule: 0 9 * * *',
    'enabled: true',
    '---',
    'Generate a morning brief for me.',
  ].join('\n'));
  writeFileSync(join(responsibilitiesDirPath, 'disabled-task.md'), [
    '---',
    'name: Disabled Task',
    'schedule: 0 22 * * *',
    'enabled: false',
    '---',
    'This one is intentionally disabled.',
  ].join('\n'));

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
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });
  const firstSync = syncPersonaResponsibilities({
    db: db as ProtegeDatabase,
    personaId,
    roots,
    nowIso: '2026-02-20T10:00:00.000Z',
  });
  firstSyncUpserted = firstSync.upsertedCount;
  firstSyncDisabled = firstSync.disabledCount;

  unlinkSync(join(responsibilitiesDirPath, 'daily-brief.md'));
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
  rmSync(tempRootPath, { recursive: true, force: true });
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

