import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Represents one file payload used by relay workspace helper.
 */
export type RelayTestFilePayload = string | Record<string, unknown>;

/**
 * Represents one isolated relay test workspace lifecycle controller.
 */
export type RelayTestWorkspace = {
  tempRootPath: string;
  previousCwd: string;
  writeFile: (
    args: {
      relativePath: string;
      payload: RelayTestFilePayload;
    },
  ) => void;
  cleanup: () => void;
};

/**
 * Writes one payload file under one relay test workspace root.
 */
export function writeRelayWorkspaceFile(
  args: {
    tempRootPath: string;
    relativePath: string;
    payload: RelayTestFilePayload;
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
 * Creates one isolated relay test workspace by copying one fixture app directory.
 */
export function createRelayTestWorkspaceFromFixture(
  args: {
    fixtureName: string;
    tempPrefix: string;
    chdir?: boolean;
  },
): RelayTestWorkspace {
  const previousCwd = process.cwd();
  const tempRootPath = mkdtempSync(join(tmpdir(), args.tempPrefix));
  const fixtureRootPath = join(previousCwd, 'tests', 'fixtures', 'apps', args.fixtureName);
  cpSync(fixtureRootPath, tempRootPath, { recursive: true });
  if (args.chdir !== false) {
    process.chdir(tempRootPath);
  }

  return {
    tempRootPath,
    previousCwd,
    writeFile: ({ relativePath, payload }): void => {
      writeRelayWorkspaceFile({
        tempRootPath,
        relativePath,
        payload,
      });
    },
    cleanup: (): void => {
      if (process.cwd() === tempRootPath) {
        process.chdir(previousCwd);
      }
      rmSync(tempRootPath, { recursive: true, force: true });
    },
  };
}
