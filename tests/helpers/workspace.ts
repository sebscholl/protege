import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeTestConfigFiles } from '@tests/helpers/config';

/**
 * Represents one created test workspace lifecycle controller.
 */
export type TestWorkspace = {
  tempRootPath: string;
  previousCwd: string;
  patchConfigFiles: (files: Record<string, string | Record<string, unknown>>) => void;
  cleanup: () => void;
};

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

  return {
    tempRootPath,
    previousCwd,
    patchConfigFiles: (
      files,
    ): void => {
      writeTestConfigFiles({
        tempRootPath,
        files,
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
