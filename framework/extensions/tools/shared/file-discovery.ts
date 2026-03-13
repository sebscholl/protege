import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Returns true when a ripgrep invocation fails because the executable is unavailable.
 */
export function isRipgrepUnavailableError(
  args: {
    error: unknown;
  },
): boolean {
  return args.error instanceof Error
    && args.error.message.includes('spawnSync rg ENOENT');
}

/**
 * Lists workspace-relative file paths below one cwd using POSIX separators.
 */
export function listRelativeFilePaths(
  args: {
    cwd: string;
  },
): string[] {
  const filePaths: string[] = [];
  collectRelativeFilePaths({
    rootCwd: args.cwd,
    currentRelativePath: '',
    output: filePaths,
  });
  return filePaths;
}

/**
 * Recursively collects relative file paths below one root path.
 */
export function collectRelativeFilePaths(
  args: {
    rootCwd: string;
    currentRelativePath: string;
    output: string[];
  },
): void {
  const absolutePath = args.currentRelativePath.length > 0
    ? join(args.rootCwd, args.currentRelativePath)
    : args.rootCwd;
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    const entryRelativePath = args.currentRelativePath.length > 0
      ? `${args.currentRelativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      collectRelativeFilePaths({
        rootCwd: args.rootCwd,
        currentRelativePath: entryRelativePath,
        output: args.output,
      });
      continue;
    }

    if (entry.isFile()) {
      args.output.push(entryRelativePath);
    }
  }
}

/**
 * Creates a file-path predicate from one glob pattern.
 */
export function createGlobMatcher(
  args: {
    pattern: string;
  },
): (value: string) => boolean {
  const expression = globPatternToRegExp({
    pattern: args.pattern,
  });
  return (value: string): boolean => expression.test(value);
}

/**
 * Converts a basic glob pattern into a regular-expression matcher.
 */
export function globPatternToRegExp(
  args: {
    pattern: string;
  },
): RegExp {
  const escapedPattern = args.pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1');
  const regexPattern = escapedPattern
    .replace(/\*\*/g, '__PROTEGE_GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__PROTEGE_GLOBSTAR__/g, '.*');
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Runs one file-search fallback implementation when ripgrep is unavailable.
 */
export function runSearchFallback(
  args: {
    query: string;
    searchRoot: string;
    workspaceRoot: string;
    isRegex: boolean;
    maxResults: number;
  },
): Array<{
  path: string;
  line: number;
  column: number;
  preview: string;
}> {
  const output: Array<{
    path: string;
    line: number;
    column: number;
    preview: string;
  }> = [];
  const matcher = args.isRegex
    ? new RegExp(args.query)
    : undefined;
  for (const relativePath of listRelativeFilePaths({
    cwd: args.searchRoot,
  })) {
    if (output.length >= args.maxResults) {
      break;
    }

    const absolutePath = resolve(args.searchRoot, relativePath);
    const fileText = readTextFileSafely({
      absolutePath,
    });
    if (fileText === undefined) {
      continue;
    }

    const lines = fileText.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (output.length >= args.maxResults) {
        break;
      }

      const preview = lines[index];
      const column = matcher
        ? findRegexColumn({
          matcher,
          preview,
        })
        : preview.indexOf(args.query) + 1;
      if (column <= 0) {
        continue;
      }

      output.push({
        path: relative(args.workspaceRoot, absolutePath),
        line: index + 1,
        column,
        preview,
      });
    }
  }

  return output;
}

/**
 * Returns one 1-based column index for the first regex match on one line.
 */
export function findRegexColumn(
  args: {
    matcher: RegExp;
    preview: string;
  },
): number {
  args.matcher.lastIndex = 0;
  const match = args.matcher.exec(args.preview);
  return match?.index === undefined ? 0 : match.index + 1;
}

/**
 * Reads one UTF-8 file and returns undefined for non-readable/binary content.
 */
export function readTextFileSafely(
  args: {
    absolutePath: string;
  },
): string | undefined {
  try {
    return readFileSync(args.absolutePath, 'utf8');
  } catch {
    return undefined;
  }
}
