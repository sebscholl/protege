import type { PrettyLogStyleToken, PrettyLogTheme } from '@relay/src/shared/theme';

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
 * Returns one console line terminator for selected log format.
 */
export function readConsoleLineTerminator(
  args: {
    consoleLogFormat: 'json' | 'pretty';
  },
): string {
  return args.consoleLogFormat === 'pretty' ? '\n\n' : '\n';
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
    .map((token) => readAnsiCodeForToken({ token }))
    .join('');
  return `${prefix}${args.text}\u001b[0m`;
}

/**
 * Returns one ANSI escape sequence for one pretty-log style token.
 */
export function readAnsiCodeForToken(
  args: {
    token: PrettyLogStyleToken;
  },
): string {
  if (args.token === 'bold') return '\u001b[1m';
  if (args.token === 'dim') return '\u001b[2m';
  if (args.token === 'red') return '\u001b[31m';
  if (args.token === 'green') return '\u001b[32m';
  if (args.token === 'yellow') return '\u001b[33m';
  if (args.token === 'blue') return '\u001b[34m';
  if (args.token === 'magenta') return '\u001b[35m';
  if (args.token === 'cyan') return '\u001b[36m';
  return '\u001b[37m';
}

/**
 * Stringifies one unknown payload value for pretty log printing.
 */
export function stringifyValue(
  args: {
    value: unknown;
  },
): string {
  if (typeof args.value === 'string') {
    return args.value;
  }
  if (typeof args.value === 'number' || typeof args.value === 'boolean' || args.value === null) {
    return String(args.value);
  }
  try {
    return JSON.stringify(args.value);
  } catch {
    return '[unserializable]';
  }
}
