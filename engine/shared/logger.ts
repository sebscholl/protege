import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { GatewayLogger } from '@engine/gateway/types';
import type { PrettyLogStyleToken, PrettyLogTheme } from '@engine/shared/runtime-config';

/**
 * Represents one logger creation input for unified runtime logging.
 */
export type UnifiedLoggerConfig = {
  logsDirPath: string;
  scope: string;
  consoleLogFormat?: 'json' | 'pretty';
  emitToConsole?: boolean;
  prettyLogTheme?: PrettyLogTheme;
};

/**
 * Creates one JSON-line logger writing to stdout/stderr and a shared log file.
 */
export function createUnifiedLogger(
  args: UnifiedLoggerConfig,
): GatewayLogger {
  const logFilePath = join(args.logsDirPath, 'protege.log');
  const consoleLogFormat = args.consoleLogFormat ?? 'json';
  const emitToConsole = args.emitToConsole ?? true;
  const prettyLogTheme = args.prettyLogTheme;
  mkdirSync(args.logsDirPath, { recursive: true });

  return {
    info: (
      logArgs: {
        event: string;
        context: Record<string, unknown>;
      },
    ): void => {
      const payload = {
        level: 'info',
        scope: args.scope,
        event: logArgs.event,
        timestamp: new Date().toISOString(),
        ...logArgs.context,
      };
      appendLine({
        logFilePath,
        line: JSON.stringify(payload),
      });
      if (emitToConsole) {
        process.stdout.write(`${formatConsoleLine({
          payload,
          consoleLogFormat,
          prettyLogTheme,
        })}${readConsoleLineTerminator({
          consoleLogFormat,
        })}`);
      }
    },
    error: (
      logArgs: {
        event: string;
        context: Record<string, unknown>;
      },
    ): void => {
      const payload = {
        level: 'error',
        scope: args.scope,
        event: logArgs.event,
        timestamp: new Date().toISOString(),
        ...logArgs.context,
      };
      appendLine({
        logFilePath,
        line: JSON.stringify(payload),
      });
      if (emitToConsole) {
        process.stderr.write(`${formatConsoleLine({
          payload,
          consoleLogFormat,
          prettyLogTheme,
        })}${readConsoleLineTerminator({
          consoleLogFormat,
        })}`);
      }
    },
  };
}

/**
 * Appends one line to log file path with newline termination.
 */
export function appendLine(
  args: {
    logFilePath: string;
    line: string;
  },
): void {
  appendFileSync(args.logFilePath, `${args.line}\n`);
}

/**
 * Formats one log payload for console output in JSON or readable key-value style.
 */
export function formatConsoleLine(
  args: {
    payload: Record<string, unknown>;
    consoleLogFormat: 'json' | 'pretty';
    prettyLogTheme?: PrettyLogTheme;
  },
): string {
  if (args.consoleLogFormat === 'json') {
    return JSON.stringify(args.payload);
  }

  const theme = args.prettyLogTheme;
  const timestamp = stringifyValue({ value: args.payload.timestamp });
  const level = stringifyValue({ value: args.payload.level }).toUpperCase();
  const scope = stringifyValue({ value: args.payload.scope });
  const event = stringifyValue({ value: args.payload.event });
  const baseLine = [
    `[${applyPrettyStyle({
      text: timestamp,
      tokens: theme?.header.timestamp,
      enabled: theme?.enabled ?? false,
    })}]`,
    applyPrettyStyle({
      text: level,
      tokens: [
        ...(theme?.header.level ?? []),
        ...(level === 'ERROR' ? theme?.level.error ?? [] : theme?.level.info ?? []),
      ],
      enabled: theme?.enabled ?? false,
    }),
    applyPrettyStyle({
      text: scope,
      tokens: theme?.header.scope,
      enabled: theme?.enabled ?? false,
    }),
    applyPrettyStyle({
      text: event,
      tokens: theme?.header.event,
      enabled: theme?.enabled ?? false,
    }),
  ].join(' ');
  const contextEntries = Object.entries(args.payload)
    .filter(([key]) => !['timestamp', 'level', 'scope', 'event'].includes(key))
    .map(([key, value]) => {
      const styledKey = applyPrettyStyle({
        text: key,
        tokens: theme?.context.key,
        enabled: theme?.enabled ?? false,
      });
      const styledValue = applyPrettyStyle({
        text: stringifyValue({ value }),
        tokens: theme?.context.value,
        enabled: theme?.enabled ?? false,
      });
      const indent = theme?.indent ?? '\t';
      return `${indent}${styledKey}=${styledValue}`;
    });
  return contextEntries.length > 0
    ? [baseLine, ...contextEntries].join('\n')
    : baseLine;
}

/**
 * Applies one ordered ANSI style-token list to text when theme styling is enabled.
 */
export function applyPrettyStyle(
  args: {
    text: string;
    tokens?: PrettyLogStyleToken[];
    enabled: boolean;
  },
): string {
  if (!args.enabled || !args.tokens || args.tokens.length === 0) {
    return args.text;
  }

  const prefix = args.tokens
    .map((token) => readAnsiCodeForToken({
      token,
    }))
    .join('');
  const reset = '\u001b[0m';
  return `${prefix}${args.text}${reset}`;
}

/**
 * Returns one ANSI escape sequence for one pretty-log style token.
 */
export function readAnsiCodeForToken(
  args: {
    token: PrettyLogStyleToken;
  },
): string {
  if (args.token === 'bold') {
    return '\u001b[1m';
  }
  if (args.token === 'dim') {
    return '\u001b[2m';
  }
  if (args.token === 'red') {
    return '\u001b[31m';
  }
  if (args.token === 'green') {
    return '\u001b[32m';
  }
  if (args.token === 'yellow') {
    return '\u001b[33m';
  }
  if (args.token === 'blue') {
    return '\u001b[34m';
  }
  if (args.token === 'magenta') {
    return '\u001b[35m';
  }
  if (args.token === 'cyan') {
    return '\u001b[36m';
  }

  return '\u001b[37m';
}

/**
 * Formats one unknown value into a compact string representation for log lines.
 */
export function stringifyValue(
  args: {
    value: unknown;
  },
): string {
  if (typeof args.value === 'string') {
    return args.value;
  }

  if (args.value === null || args.value === undefined) {
    return 'null';
  }

  if (typeof args.value === 'number' || typeof args.value === 'boolean') {
    return String(args.value);
  }

  return JSON.stringify(args.value);
}

/**
 * Returns one console line terminator based on selected output format.
 */
export function readConsoleLineTerminator(
  args: {
    consoleLogFormat: 'json' | 'pretty';
  },
): string {
  if (args.consoleLogFormat === 'pretty') {
    return '\n\n';
  }

  return '\n';
}
