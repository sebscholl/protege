import type { ProtegeDatabase } from '@engine/shared/database';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let databasePath = '';
let db: ProtegeDatabase | undefined;
let tableNames: string[] = [];

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-db-bootstrap-',
    chdir: false,
  });
  databasePath = join(workspace.tempRootPath, 'temporal.db');
  db = initializeDatabase({
    databasePath,
    migrationsDirPath: join(process.cwd(), 'engine', 'shared', 'migrations'),
  });

  tableNames = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).pluck().all() as string[];
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('shared database bootstrap', () => {
  it('creates a sqlite database file on disk', () => {
    expect(existsSync(databasePath)).toBe(true);
  });

  it('creates core threads, messages, responsibilities, and run tables', () => {
    expect(['threads', 'messages', 'responsibilities', 'responsibility_runs'].every((name) => tableNames.includes(name))).toBe(true);
  });

  it('creates the messages fts table for search', () => {
    expect(tableNames.includes('messages_fts')).toBe(true);
  });

  it('tracks executed migrations in migration table', () => {
    expect(tableNames.includes('_protege_migrations')).toBe(true);
  });
});
