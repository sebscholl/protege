import type { Database as SqliteDatabase } from 'better-sqlite3';

import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';

/**
 * Represents one opened Protege SQLite database handle.
 */
export type ProtegeDatabase = SqliteDatabase;

const MIGRATIONS_TABLE = '_protege_migrations';

/**
 * Resolves the default SQLite file path for local Protege memory.
 */
export function resolveDefaultDatabasePath(): string {
  return join(process.cwd(), 'memory', 'temporal.db');
}

/**
 * Opens one SQLite database and enables foreign key constraints.
 */
export function openDatabase(
  args: {
    databasePath: string;
  },
): ProtegeDatabase {
  mkdirSync(dirname(args.databasePath), { recursive: true });
  const db = new Database(args.databasePath);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Creates the migration tracking table when it is not already present.
 */
export function ensureMigrationTable(
  args: {
    db: ProtegeDatabase;
  },
): void {
  args.db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL
    );
  `);
}

/**
 * Applies unapplied SQL migrations in lexical filename order.
 */
export function applyMigrations(
  args: {
    db: ProtegeDatabase;
    migrationsDirPath: string;
  },
): void {
  ensureMigrationTable({ db: args.db });

  const migrationFiles = readdirSync(args.migrationsDirPath)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const hasMigration = args.db.prepare(
    `SELECT name FROM ${MIGRATIONS_TABLE} WHERE name = ?`,
  );
  const markMigration = args.db.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (name, executed_at) VALUES (?, ?)`,
  );

  for (const fileName of migrationFiles) {
    const existing = hasMigration.get(fileName) as { name: string } | undefined;
    if (existing) {
      continue;
    }

    const sql = readFileSync(join(args.migrationsDirPath, fileName), 'utf8');
    args.db.exec(sql);
    markMigration.run(fileName, new Date().toISOString());
  }
}

/**
 * Opens and initializes the default Protege database with migrations.
 */
export function initializeDatabase(
  args: {
    databasePath?: string;
    migrationsDirPath?: string;
  } = {},
): ProtegeDatabase {
  const databasePath = args.databasePath ?? resolveDefaultDatabasePath();
  const migrationsDirPath = args.migrationsDirPath
    ?? join(process.cwd(), 'engine', 'shared', 'migrations');
  const db = openDatabase({ databasePath });
  applyMigrations({ db, migrationsDirPath });
  return db;
}
