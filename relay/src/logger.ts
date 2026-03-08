import type { PrettyLogTheme } from '@engine/shared/runtime-config';

import { formatConsoleLine, readConsoleLineTerminator } from '@engine/shared/logger';

/**
 * Represents one relay console logger configuration.
 */
export type RelayConsoleLoggerConfig = {
  consoleLogFormat: 'json' | 'pretty';
  prettyLogTheme: PrettyLogTheme;
};

/**
 * Represents one relay structured log payload.
 */
export type RelayLogPayload = {
  level: 'info' | 'error';
  scope: 'relay';
  event: string;
  timestamp: string;
} & Record<string, unknown>;

/**
 * Creates one relay console logger with json/pretty formatting support.
 */
export function createRelayConsoleLogger(
  args: RelayConsoleLoggerConfig,
): {
  info: (
    args: {
      event: string;
      context?: Record<string, unknown>;
    },
  ) => void;
  error: (
    args: {
      event: string;
      context?: Record<string, unknown>;
    },
  ) => void;
} {
  return {
    info: (
      infoArgs: {
        event: string;
        context?: Record<string, unknown>;
      },
    ): void => {
      const payload = createRelayLogPayload({
        level: 'info',
        event: infoArgs.event,
        context: infoArgs.context ?? {},
      });
      process.stdout.write(formatRelayConsoleLogLine({
        payload,
        consoleLogFormat: args.consoleLogFormat,
        prettyLogTheme: args.prettyLogTheme,
      }));
    },
    error: (
      errorArgs: {
        event: string;
        context?: Record<string, unknown>;
      },
    ): void => {
      const payload = createRelayLogPayload({
        level: 'error',
        event: errorArgs.event,
        context: errorArgs.context ?? {},
      });
      process.stderr.write(formatRelayConsoleLogLine({
        payload,
        consoleLogFormat: args.consoleLogFormat,
        prettyLogTheme: args.prettyLogTheme,
      }));
    },
  };
}

/**
 * Creates one normalized relay log payload with standard runtime metadata.
 */
export function createRelayLogPayload(
  args: {
    level: 'info' | 'error';
    event: string;
    context: Record<string, unknown>;
  },
): RelayLogPayload {
  return {
    level: args.level,
    scope: 'relay',
    event: args.event,
    timestamp: new Date().toISOString(),
    ...args.context,
  };
}

/**
 * Formats one relay log payload into console output with matching json/pretty semantics.
 */
export function formatRelayConsoleLogLine(
  args: {
    payload: RelayLogPayload;
    consoleLogFormat: 'json' | 'pretty';
    prettyLogTheme: PrettyLogTheme;
  },
): string {
  return `${formatConsoleLine({
    payload: args.payload,
    consoleLogFormat: args.consoleLogFormat,
    prettyLogTheme: args.prettyLogTheme,
  })}${readConsoleLineTerminator({
    consoleLogFormat: args.consoleLogFormat,
  })}`;
}
