import type { ProtegeDatabase } from '@engine/shared/database';
import type { GatewayLogger } from '@engine/gateway/types';

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initializeDatabase } from '@engine/shared/database';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { createUnifiedLogger } from '@engine/shared/logger';
import { writeTestConfigFiles } from '@tests/helpers/config';

/**
 * Represents one supported test file payload type.
 */
export type TestFilePayload = string | Record<string, unknown>;

/**
 * Represents one created test workspace lifecycle controller.
 */
export type TestWorkspace = {
  tempRootPath: string;
  previousCwd: string;
  logger: GatewayLogger;
  openPersonaDb: (args: { personaId: string }) => ProtegeDatabase;
  patchConfigFiles: (files: Record<string, string | Record<string, unknown>>) => void;
  patchExtensionsManifest: (manifestPatch: Record<string, unknown>) => void;
  patchPersona: (
    args: {
      personaId: string;
      personaPatch: Record<string, unknown>;
    },
  ) => void;
  writeFile: (
    args: {
      relativePath: string;
      payload: TestFilePayload;
    },
  ) => void;
  cleanup: () => void;
};

/**
 * Deep merges one object into another for test helper patch workflows.
 */
function deepMerge(
  args: {
    baseValue: unknown;
    patchValue: unknown;
  },
): unknown {
  if (
    typeof args.baseValue !== 'object'
    || args.baseValue === null
    || Array.isArray(args.baseValue)
    || typeof args.patchValue !== 'object'
    || args.patchValue === null
    || Array.isArray(args.patchValue)
  ) {
    return args.patchValue;
  }

  const mergedRecord: Record<string, unknown> = { ...(args.baseValue as Record<string, unknown>) };
  for (const [key, value] of Object.entries(args.patchValue as Record<string, unknown>)) {
    if (!(key in mergedRecord)) {
      mergedRecord[key] = value;
      continue;
    }

    mergedRecord[key] = deepMerge({
      baseValue: mergedRecord[key],
      patchValue: value,
    });
  }
  return mergedRecord;
}

/**
 * Reads one json file from disk and returns one empty object when missing.
 */
function readJsonFileOrDefault(
  args: {
    filePath: string;
  },
): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(args.filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Writes one payload file under the test workspace root.
 */
function writeWorkspaceFile(
  args: {
    tempRootPath: string;
    relativePath: string;
    payload: TestFilePayload;
  },
): void {
  const targetPath = join(args.tempRootPath, args.relativePath);
  mkdirSync(join(targetPath, '..'), { recursive: true });
  if (typeof args.payload === 'string') {
    writeFileSync(targetPath, args.payload);
    return;
  }

  writeFileSync(targetPath, JSON.stringify(args.payload, null, 2));
}

/**
 * Creates one isolated temp workspace by copying a committed fixture app template.
 */
export function createTestWorkspaceFromFixture(
  args: {
    fixtureName: string;
    tempPrefix: string;
    chdir?: boolean;
    symlinkExtensionsFromRepo?: boolean;
  },
): TestWorkspace {
  const previousCwd = process.cwd();
  const tempRootPath = mkdtempSync(join(tmpdir(), args.tempPrefix));
  const fixtureRootPath = join(previousCwd, 'tests', 'fixtures', 'apps', args.fixtureName);

  cpSync(fixtureRootPath, tempRootPath, { recursive: true });
  if (args.symlinkExtensionsFromRepo) {
    symlinkSync(join(previousCwd, 'extensions'), join(tempRootPath, 'extensions'));
  }
  if (args.chdir !== false) {
    process.chdir(tempRootPath);
  }

  const openedDbs: ProtegeDatabase[] = [];

  function openPersonaDb(
    dbArgs: { personaId: string },
  ): ProtegeDatabase {
    const dbPath = join(tempRootPath, 'memory', dbArgs.personaId, 'temporal.db');
    const db = initializeDatabase({
      databasePath: dbPath,
      migrationsDirPath: resolveMigrationsDirPath(),
    });
    openedDbs.push(db);
    return db;
  }

  return {
    tempRootPath,
    previousCwd,
    logger: createUnifiedLogger({
      logsDirPath: join(tempRootPath, 'tmp', 'logs'),
      scope: 'test',
      emitToConsole: false,
    }),
    openPersonaDb,
    patchConfigFiles: (
      files,
    ): void => {
      writeTestConfigFiles({
        tempRootPath,
        files,
      });
    },
    patchExtensionsManifest: (
      manifestPatch,
    ): void => {
      const manifestPath = join(tempRootPath, 'extensions', 'extensions.json');
      const currentManifest = readJsonFileOrDefault({
        filePath: manifestPath,
      });
      const mergedManifest = deepMerge({
        baseValue: currentManifest,
        patchValue: manifestPatch,
      }) as Record<string, unknown>;
      writeWorkspaceFile({
        tempRootPath,
        relativePath: 'extensions/extensions.json',
        payload: mergedManifest,
      });
    },
    patchPersona: (
      args,
    ): void => {
      const relativePath = join('personas', args.personaId, 'persona.json');
      const personaPath = join(tempRootPath, relativePath);
      const currentPersona = readJsonFileOrDefault({
        filePath: personaPath,
      });
      const mergedPersona = deepMerge({
        baseValue: currentPersona,
        patchValue: args.personaPatch,
      }) as Record<string, unknown>;
      writeWorkspaceFile({
        tempRootPath,
        relativePath,
        payload: mergedPersona,
      });
    },
    writeFile: (
      args,
    ): void => {
      writeWorkspaceFile({
        tempRootPath,
        relativePath: args.relativePath,
        payload: args.payload,
      });
    },
    cleanup: (): void => {
      for (const db of openedDbs) {
        try { db.close(); } catch { /* already closed */ }
      }
      if (process.cwd() === tempRootPath) {
        process.chdir(previousCwd);
      }
      rmSync(tempRootPath, { recursive: true, force: true });
    },
  };
}
