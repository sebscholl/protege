import { runSearchFallback, isRipgrepUnavailableError } from '../shared/file-discovery';
import {
  readOptionalRuntimeBoolean,
  readOptionalRuntimePositiveInteger,
  readRequiredRuntimePath,
  readRequiredRuntimeString,
} from '../shared/runtime-action-helpers';
import { parseRipgrepMatchLine, runRipgrepCommand, type RipgrepExecFileSync } from '../shared/ripgrep';

/**
 * Runs one file.search runtime action and returns line/column matches.
 */
export function runSearchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    execFileSyncFn?: RipgrepExecFileSync;
  },
): Record<string, unknown> {
  const query = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'query',
    actionName: 'file.search',
  });
  const searchRoot = args.payload.path === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'path',
      actionName: 'file.search',
      enforceWorkspaceRoot: false,
    });
  const isRegex = readOptionalRuntimeBoolean({
    payload: args.payload,
    fieldName: 'isRegex',
    actionName: 'file.search',
  }) ?? false;
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'file.search',
  }) ?? 200;
  const ripgrepArgs = [
    '-n',
    '--column',
    '--no-heading',
    ...(isRegex ? [] : ['--fixed-strings']),
    query,
    '.',
  ];
  const workspaceRoot = process.cwd();
  let matches: Array<{
    path: string;
    line: number;
    column: number;
    preview: string;
  }>;
  try {
    const output = runRipgrepCommand({
      args: ripgrepArgs,
      cwd: searchRoot,
      execFileSyncFn: args.execFileSyncFn,
      actionName: 'file.search',
      allowNoMatches: true,
    });
    matches = output
      .split('\n')
      .map((line) => parseRipgrepMatchLine({
        line,
        cwd: searchRoot,
        workspaceRoot,
      }))
      .filter((match): match is {
        path: string;
        line: number;
        column: number;
        preview: string;
      } => match !== undefined)
      .slice(0, maxResults);
  } catch (error) {
    if (!isRipgrepUnavailableError({ error })) {
      throw error;
    }
    matches = runSearchFallback({
      query,
      searchRoot,
      workspaceRoot,
      isRegex,
      maxResults,
    });
  }

  return {
    matches,
  };
}
