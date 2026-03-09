import { existsSync, readFileSync } from 'node:fs';

/**
 * Represents one configurable pretty-log style token.
 */
export type PrettyLogStyleToken =
  | 'bold'
  | 'dim'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white';

/**
 * Represents one configurable pretty-log theme loaded from relay theme config.
 */
export type PrettyLogTheme = {
  enabled: boolean;
  indent: string;
  header: {
    timestamp: PrettyLogStyleToken[];
    level: PrettyLogStyleToken[];
    scope: PrettyLogStyleToken[];
    event: PrettyLogStyleToken[];
  };
  level: {
    info: PrettyLogStyleToken[];
    error: PrettyLogStyleToken[];
  };
  context: {
    key: PrettyLogStyleToken[];
    value: PrettyLogStyleToken[];
  };
};

/**
 * Returns one default pretty log theme when relay theme file is missing.
 */
export function getDefaultPrettyLogTheme(): PrettyLogTheme {
  return {
    enabled: false,
    indent: '\t',
    header: {
      timestamp: ['dim'],
      level: ['bold'],
      scope: ['cyan'],
      event: ['white'],
    },
    level: {
      info: ['green'],
      error: ['red'],
    },
    context: {
      key: ['blue'],
      value: ['white'],
    },
  };
}

/**
 * Reads pretty-log theme configuration from one JSON file path.
 */
export function readPrettyLogTheme(
  args: {
    themeConfigPath: string;
  },
): PrettyLogTheme {
  if (!existsSync(args.themeConfigPath)) {
    return getDefaultPrettyLogTheme();
  }

  const parsed = JSON.parse(readFileSync(args.themeConfigPath, 'utf8')) as Record<string, unknown>;
  const pretty = (typeof parsed.pretty_log === 'object' && parsed.pretty_log !== null
    ? parsed.pretty_log
    : {}) as Record<string, unknown>;

  const defaultTheme = getDefaultPrettyLogTheme();
  return {
    enabled: pretty.enabled === true,
    indent: typeof pretty.indent === 'string' && pretty.indent.length > 0
      ? pretty.indent
      : defaultTheme.indent,
    header: {
      timestamp: readStyleTokenArray({ value: (pretty.header as Record<string, unknown> | undefined)?.timestamp })
        ?? defaultTheme.header.timestamp,
      level: readStyleTokenArray({ value: (pretty.header as Record<string, unknown> | undefined)?.level })
        ?? defaultTheme.header.level,
      scope: readStyleTokenArray({ value: (pretty.header as Record<string, unknown> | undefined)?.scope })
        ?? defaultTheme.header.scope,
      event: readStyleTokenArray({ value: (pretty.header as Record<string, unknown> | undefined)?.event })
        ?? defaultTheme.header.event,
    },
    level: {
      info: readStyleTokenArray({ value: (pretty.level as Record<string, unknown> | undefined)?.info })
        ?? defaultTheme.level.info,
      error: readStyleTokenArray({ value: (pretty.level as Record<string, unknown> | undefined)?.error })
        ?? defaultTheme.level.error,
    },
    context: {
      key: readStyleTokenArray({ value: (pretty.context as Record<string, unknown> | undefined)?.key })
        ?? defaultTheme.context.key,
      value: readStyleTokenArray({ value: (pretty.context as Record<string, unknown> | undefined)?.value })
        ?? defaultTheme.context.value,
    },
  };
}

/**
 * Reads one style token array from unknown input.
 */
export function readStyleTokenArray(
  args: {
    value: unknown;
  },
): PrettyLogStyleToken[] | undefined {
  if (!Array.isArray(args.value)) {
    return undefined;
  }

  const allowed = new Set<PrettyLogStyleToken>([
    'bold',
    'dim',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
  ]);

  const tokens = args.value
    .filter((item): item is PrettyLogStyleToken => typeof item === 'string' && allowed.has(item as PrettyLogStyleToken));
  return tokens.length > 0 ? tokens : undefined;
}
