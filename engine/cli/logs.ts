import { existsSync, readFileSync, watchFile } from 'node:fs';
import { join } from 'node:path';

import { formatConsoleLine, readConsoleLineTerminator } from '@engine/shared/logger';
import { emitCliText } from '@engine/cli/output';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

/**
 * Represents parsed `protege logs` flag state.
 */
export type LogsCommandArgs = {
  follow: boolean;
  tail: number;
  scope: 'gateway' | 'harness' | 'relay' | 'scheduler' | 'chat' | 'all';
  json: boolean;
};

/**
 * Parses `protege logs` command arguments.
 */
export function parseLogsArgs(
  args: {
    argv: string[];
  },
): LogsCommandArgs {
  let follow = false;
  let tail = 100;
  let scope: LogsCommandArgs['scope'] = 'all';
  let json = false;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--follow') {
      follow = true;
      continue;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--tail') {
      const value = Number(args.argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Usage: protege logs [--follow] [--tail <n>] [--scope <gateway|harness|relay|scheduler|chat|all>] [--json]');
      }
      tail = value;
      index += 1;
      continue;
    }
    if (token === '--scope') {
      const value = args.argv[index + 1];
      if (value !== 'gateway' && value !== 'harness' && value !== 'relay' && value !== 'scheduler' && value !== 'chat' && value !== 'all') {
        throw new Error('Usage: protege logs [--follow] [--tail <n>] [--scope <gateway|harness|relay|scheduler|chat|all>] [--json]');
      }
      scope = value;
      index += 1;
    }
  }

  return {
    follow,
    tail,
    scope,
    json,
  };
}

/**
 * Runs `protege logs` command output and optional follow mode.
 */
export function runLogsCommand(
  args: {
    argv: string[];
  },
): void {
  const parsed = parseLogsArgs({
    argv: args.argv,
  });
  const logFilePath = resolveUnifiedLogFilePath();
  const runtimeConfig = readGlobalRuntimeConfig();
  if (!existsSync(logFilePath)) {
    throw new Error(`Log file not found at ${logFilePath}`);
  }

  const initialLines = readLogLines({
    logFilePath,
  });
  const filteredInitialLines = filterLogLines({
    lines: initialLines,
    scope: parsed.scope,
  });
  writeLogOutput({
    lines: filteredInitialLines.slice(-parsed.tail),
    json: parsed.json,
    prettyTheme: runtimeConfig.prettyLogTheme,
  });
  if (!parsed.follow) {
    return;
  }

  startLogsFollowMode({
    logFilePath,
    scope: parsed.scope,
    json: parsed.json,
    prettyTheme: runtimeConfig.prettyLogTheme,
  });
}

/**
 * Resolves the current unified log file path from global runtime config.
 */
export function resolveUnifiedLogFilePath(): string {
  const runtimeConfig = readGlobalRuntimeConfig();
  return join(runtimeConfig.logsDirPath, 'protege.log');
}

/**
 * Reads all lines from one log file.
 */
export function readLogLines(
  args: {
    logFilePath: string;
  },
): string[] {
  return readFileSync(args.logFilePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Filters JSON-line logs by scope while retaining valid fallback lines.
 */
export function filterLogLines(
  args: {
    lines: string[];
    scope: LogsCommandArgs['scope'];
  },
): string[] {
  if (args.scope === 'all') {
    return args.lines;
  }

  return args.lines.filter((line) => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed.scope === args.scope;
    } catch {
      return false;
    }
  });
}

/**
 * Writes one list of logs as JSON lines or readable pretty lines.
 */
export function writeLogOutput(
  args: {
    lines: string[];
    json: boolean;
    prettyTheme: ReturnType<typeof readGlobalRuntimeConfig>['prettyLogTheme'];
  },
): void {
  for (const line of args.lines) {
    if (args.json) {
      emitCliText({ value: line });
      continue;
    }
    emitCliText({
      value: `${formatPrettyLogLine({
        line,
        prettyTheme: args.prettyTheme,
      })}${readConsoleLineTerminator({
        consoleLogFormat: 'pretty',
      })}`,
      trailingNewlines: 0,
    });
  }
}

/**
 * Formats one JSON log line into readable output when possible.
 */
export function formatPrettyLogLine(
  args: {
    line: string;
    prettyTheme: ReturnType<typeof readGlobalRuntimeConfig>['prettyLogTheme'];
  },
): string {
  try {
    const parsed = JSON.parse(args.line) as Record<string, unknown>;
    return formatConsoleLine({
      payload: parsed,
      consoleLogFormat: 'pretty',
      prettyLogTheme: args.prettyTheme,
    });
  } catch {
    return args.line;
  }
}

/**
 * Starts tail-follow behavior by watching file changes and printing appended records.
 */
export function startLogsFollowMode(
  args: {
    logFilePath: string;
    scope: LogsCommandArgs['scope'];
    json: boolean;
    prettyTheme: ReturnType<typeof readGlobalRuntimeConfig>['prettyLogTheme'];
  },
): void {
  let seenLineCount = readLogLines({
    logFilePath: args.logFilePath,
  }).length;

  watchFile(args.logFilePath, { interval: 400 }, (): void => {
    const currentLines = readLogLines({
      logFilePath: args.logFilePath,
    });
    if (currentLines.length <= seenLineCount) {
      return;
    }
    const appendedLines = currentLines.slice(seenLineCount);
    seenLineCount = currentLines.length;
    writeLogOutput({
      lines: filterLogLines({
        lines: appendedLines,
        scope: args.scope,
      }),
      json: args.json,
      prettyTheme: args.prettyTheme,
    });
  });
}
