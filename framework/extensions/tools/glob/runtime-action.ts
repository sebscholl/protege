import { relative, resolve } from 'node:path';

import {
  createGlobMatcher,
  isRipgrepUnavailableError,
  listRelativeFilePaths,
} from '../shared/file-discovery';
import {
  readOptionalRuntimePositiveInteger,
  readRequiredRuntimePath,
  readRequiredRuntimeString,
} from '../shared/runtime-action-helpers';
import { runRipgrepCommand, type RipgrepExecFileSync } from '../shared/ripgrep';

/**
 * Runs one file.glob runtime action and returns matching workspace-relative paths.
 */
export function runGlobRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    execFileSyncFn?: RipgrepExecFileSync;
  },
): Record<string, unknown> {
  const pattern = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'pattern',
    actionName: 'file.glob',
  });
  const targetCwd = args.payload.cwd === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'cwd',
      actionName: 'file.glob',
      enforceWorkspaceRoot: false,
    });
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'file.glob',
  }) ?? 100;
  const workspaceRoot = process.cwd();
  let paths: string[];
  try {
    const output = runRipgrepCommand({
      args: ['--files', '-g', pattern],
      cwd: targetCwd,
      execFileSyncFn: args.execFileSyncFn,
      actionName: 'file.glob',
    });
    paths = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => relative(workspaceRoot, resolve(targetCwd, line)));
  } catch (error) {
    if (!isRipgrepUnavailableError({ error })) {
      throw error;
    }

    const globMatcher = createGlobMatcher({
      pattern,
    });
    paths = listRelativeFilePaths({
      cwd: targetCwd,
    })
      .filter((filePath) => globMatcher(filePath))
      .map((filePath) => relative(workspaceRoot, resolve(targetCwd, filePath)));
  }

  const limitedPaths = paths.slice(0, maxResults);
  return {
    paths: limitedPaths,
    truncated: paths.length > limitedPaths.length,
    totalMatches: paths.length,
  };
}
