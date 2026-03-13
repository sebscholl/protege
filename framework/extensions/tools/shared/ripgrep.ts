import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';

import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

/**
 * Represents one ripgrep execution function used for runtime injection in tests.
 */
export type RipgrepExecFileSync = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

/**
 * Runs one ripgrep command and returns UTF-8 stdout with actionable error mapping.
 */
export function runRipgrepCommand(
  args: {
    args: string[];
    cwd: string;
    actionName: string;
    allowNoMatches?: boolean;
    execFileSyncFn?: RipgrepExecFileSync;
  },
): string {
  const execSync = args.execFileSyncFn ?? ((
    file,
    commandArgs,
    options,
  ): string => execFileSync(file, commandArgs, options));
  try {
    return execSync('rg', args.args, {
      cwd: args.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as string;
  } catch (error) {
    const errorRecord = error as {
      status?: number;
      stderr?: string | Buffer;
      message?: string;
    };
    const status = errorRecord.status ?? null;
    if (args.allowNoMatches && status === 1) {
      return '';
    }

    const stderr = typeof errorRecord.stderr === 'string'
      ? errorRecord.stderr
      : Buffer.isBuffer(errorRecord.stderr)
        ? errorRecord.stderr.toString('utf8')
        : '';
    throw new Error(`${args.actionName} failed: ${stderr.trim() || errorRecord.message || 'unknown error'}`);
  }
}

/**
 * Parses one ripgrep match line into structured path/line/column payload fields.
 */
export function parseRipgrepMatchLine(
  args: {
    line: string;
    cwd: string;
    workspaceRoot: string;
  },
): {
  path: string;
  line: number;
  column: number;
  preview: string;
} | undefined {
  const trimmed = args.line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = trimmed.match(/^(.*?):(\d+):(\d+):(.*)$/);
  if (!match) {
    return undefined;
  }

  const [, rawPath, rawLine, rawColumn, preview] = match;
  return {
    path: relative(args.workspaceRoot, resolve(args.cwd, rawPath)),
    line: Number(rawLine),
    column: Number(rawColumn),
    preview,
  };
}
