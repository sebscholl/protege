import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { GatewayLogger } from '@engine/gateway/types';

/**
 * Represents one logger creation input for unified runtime logging.
 */
export type UnifiedLoggerConfig = {
  logsDirPath: string;
  scope: string;
  consoleLogFormat?: 'json' | 'pretty';
};

/**
 * Creates one JSON-line logger writing to stdout/stderr and a shared log file.
 */
export function createUnifiedLogger(
  args: UnifiedLoggerConfig,
): GatewayLogger {
  const logFilePath = join(args.logsDirPath, 'protege.log');
  const consoleLogFormat = args.consoleLogFormat ?? 'json';
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
      process.stdout.write(`${formatConsoleLine({
        payload,
        consoleLogFormat,
      })}\n`);
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
      process.stderr.write(`${formatConsoleLine({
        payload,
        consoleLogFormat,
      })}\n`);
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
  },
): string {
  if (args.consoleLogFormat === 'json') {
    return JSON.stringify(args.payload);
  }

  const timestamp = stringifyValue({ value: args.payload.timestamp });
  const level = stringifyValue({ value: args.payload.level }).toUpperCase();
  const scope = stringifyValue({ value: args.payload.scope });
  const event = stringifyValue({ value: args.payload.event });
  const context = Object.entries(args.payload)
    .filter(([key]) => !['timestamp', 'level', 'scope', 'event'].includes(key))
    .map(([key, value]) => `${key}=${stringifyValue({ value })}`)
    .join(' ');
  return `[${timestamp}] ${level} ${scope}.${event}${context.length > 0 ? ` ${context}` : ''}`;
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
