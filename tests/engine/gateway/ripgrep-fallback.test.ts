import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runGlobRuntimeAction, runSearchRuntimeAction } from '@engine/gateway/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let globPaths: string[] = [];
let searchMatchesCount = 0;
let firstSearchPath = '';
let nonRipgrepErrorMessage = '';

/**
 * Simulates missing ripgrep binary in CI/runtime environments.
 */
function throwMissingRipgrep(): never {
  throw new Error('spawnSync rg ENOENT');
}

/**
 * Simulates one non-ripgrep process error to verify rethrow behavior.
 */
function throwUnknownExecError(): never {
  throw new Error('exec failed for unrelated reason');
}

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-rg-fallback-',
  });
  workspace.writeFile({
    relativePath: 'docs/guide.md',
    payload: '# TODO\n',
  });
  workspace.writeFile({
    relativePath: 'src/alpha.ts',
    payload: 'const TODO = "ship";\n',
  });

  const globResult = runGlobRuntimeAction({
    payload: {
      pattern: '**/*.md',
      cwd: '.',
      maxResults: 10,
    },
    execFileSyncFn: throwMissingRipgrep as unknown as (
      file: string,
      args?: readonly string[] | undefined,
      options?: ExecFileSyncOptionsWithStringEncoding | undefined,
    ) => string,
  });
  globPaths = Array.isArray(globResult.paths)
    ? globResult.paths.map((value) => String(value))
    : [];

  const searchResult = runSearchRuntimeAction({
    payload: {
      query: 'TODO',
      path: '.',
      maxResults: 10,
    },
    execFileSyncFn: throwMissingRipgrep as unknown as (
      file: string,
      args?: readonly string[] | undefined,
      options?: ExecFileSyncOptionsWithStringEncoding | undefined,
    ) => string,
  });
  const matches = Array.isArray(searchResult.matches)
    ? searchResult.matches as Array<Record<string, unknown>>
    : [];
  searchMatchesCount = matches.length;
  firstSearchPath = searchMatchesCount > 0 ? String(matches[0].path ?? '') : '';

  try {
    runSearchRuntimeAction({
      payload: {
        query: 'TODO',
        path: '.',
      },
      execFileSyncFn: throwUnknownExecError as unknown as (
        file: string,
        args?: readonly string[] | undefined,
        options?: ExecFileSyncOptionsWithStringEncoding | undefined,
      ) => string,
    });
  } catch (error) {
    nonRipgrepErrorMessage = error instanceof Error ? error.message : String(error);
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway ripgrep fallback behavior', () => {
  it('returns file.glob paths when ripgrep binary is unavailable', () => {
    expect(globPaths.includes('docs/guide.md')).toBe(true);
  });

  it('returns file.search matches when ripgrep binary is unavailable', () => {
    expect(searchMatchesCount > 0).toBe(true);
  });

  it('returns workspace-relative paths from fallback file.search results', () => {
    expect(firstSearchPath.includes('/')).toBe(true);
  });

  it('rethrows non-ripgrep errors for file.search invocations', () => {
    expect(nonRipgrepErrorMessage.includes('unrelated reason')).toBe(true);
  });
});
