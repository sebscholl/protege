import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_LOGS_DIR_PATH = join(process.cwd(), 'tmp', 'logs');
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_SCHEDULER_POLL_INTERVAL_MS = 1000;
const DEFAULT_SCHEDULER_MAX_GLOBAL_CONCURRENT_RUNS = 5;
const DEFAULT_THEME_CONFIG_PATH = join(process.cwd(), 'config', 'theme.json');

/**
 * Represents supported chat display modes.
 */
export type ChatDisplayMode = 'light' | 'verbose';

/**
 * Represents all required chat keymap actions in v1.
 */
export type ChatKeyAction =
  | 'send'
  | 'refresh'
  | 'toggle_display_mode'
  | 'quit'
  | 'move_selection_up'
  | 'move_selection_down'
  | 'open_thread'
  | 'back_to_inbox'
  | 'new_local_thread'
  | 'enter_compose_mode';

/**
 * Represents normalized chat keymap values.
 */
export type ChatKeymap = Record<ChatKeyAction, string>;

/**
 * Represents chat runtime configuration loaded from `config/system.json`.
 */
export type ChatRuntimeConfig = {
  defaultDisplayMode: ChatDisplayMode;
  pollIntervalMs: number;
  keymap: ChatKeymap;
};

/**
 * Represents global runtime configuration shared across engine services.
 */
export type GlobalRuntimeConfig = {
  logsDirPath: string;
  consoleLogFormat: 'json' | 'pretty';
  prettyLogTheme: PrettyLogTheme;
  adminContactEmail?: string;
  chat: ChatRuntimeConfig;
  scheduler: SchedulerRuntimeSettings;
};

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
 * Represents one configurable pretty-log theme loaded from `config/theme.json`.
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
 * Represents scheduler runtime configuration loaded from `config/system.json`.
 */
export type SchedulerRuntimeSettings = {
  pollIntervalMs: number;
  maxGlobalConcurrentRuns: number;
  adminContactEmail?: string;
};

/**
 * Returns default chat key bindings for v1 chat runtime.
 */
export function getDefaultChatKeymap(): ChatKeymap {
  return {
    send: 'ctrl+s',
    refresh: 'ctrl+r',
    toggle_display_mode: 'ctrl+v',
    quit: 'ctrl+q',
    move_selection_up: 'up',
    move_selection_down: 'down',
    open_thread: 'enter',
    back_to_inbox: 'esc',
    new_local_thread: 'ctrl+n',
    enter_compose_mode: 'i',
  };
}

/**
 * Returns default chat runtime configuration values.
 */
export function getDefaultChatRuntimeConfig(): ChatRuntimeConfig {
  return {
    defaultDisplayMode: 'light',
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    keymap: getDefaultChatKeymap(),
  };
}

/**
 * Resolves default global runtime config path.
 */
export function resolveDefaultGlobalConfigPath(): string {
  return join(process.cwd(), 'config', 'system.json');
}

/**
 * Resolves default pretty-log theme config path.
 */
export function resolveDefaultThemeConfigPath(): string {
  return DEFAULT_THEME_CONFIG_PATH;
}

/**
 * Reads global runtime config and applies defaults when file is absent.
 */
export function readGlobalRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): GlobalRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultGlobalConfigPath();
  if (!existsSync(configPath)) {
    return {
      logsDirPath: DEFAULT_LOGS_DIR_PATH,
      consoleLogFormat: 'json',
      prettyLogTheme: readPrettyLogTheme({
        themeConfigPath: resolveDefaultThemeConfigPath(),
      }),
      chat: getDefaultChatRuntimeConfig(),
      scheduler: getDefaultSchedulerRuntimeSettings(),
    };
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const logsDirPath = typeof parsed.logs_dir_path === 'string' && parsed.logs_dir_path.length > 0
    ? parsed.logs_dir_path
    : DEFAULT_LOGS_DIR_PATH;
  const consoleLogFormat = parsed.console_log_format === 'pretty' ? 'pretty' : 'json';
  const themeConfigPath = typeof parsed.theme_config_path === 'string' && parsed.theme_config_path.trim().length > 0
    ? resolve(process.cwd(), parsed.theme_config_path)
    : resolveDefaultThemeConfigPath();
  const prettyLogTheme = readPrettyLogTheme({
    themeConfigPath,
  });
  const chat = parseChatRuntimeConfig({
    value: parsed.chat,
  });
  const globalAdminContactEmail = parseOptionalAdminContactEmail({
    value: parsed.admin_contact_email,
  });
  const scheduler = parseSchedulerRuntimeSettings({
    value: parsed.scheduler,
    globalAdminContactEmail,
  });
  return {
    logsDirPath,
    consoleLogFormat,
    prettyLogTheme,
    adminContactEmail: globalAdminContactEmail ?? scheduler.adminContactEmail,
    chat,
    scheduler,
  };
}

/**
 * Returns default pretty-log theme values.
 */
export function getDefaultPrettyLogTheme(): PrettyLogTheme {
  return {
    enabled: true,
    indent: '\t',
    header: {
      timestamp: ['dim'],
      level: ['bold'],
      scope: ['cyan'],
      event: ['magenta'],
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
 * Reads and parses one pretty-log theme file with strict token filtering and fallback defaults.
 */
export function readPrettyLogTheme(
  args: {
    themeConfigPath: string;
  },
): PrettyLogTheme {
  const defaults = getDefaultPrettyLogTheme();
  if (!existsSync(args.themeConfigPath)) {
    return defaults;
  }

  const parsed = JSON.parse(readFileSync(args.themeConfigPath, 'utf8')) as Record<string, unknown>;
  if (!isRecord(parsed.pretty_logs)) {
    return defaults;
  }

  const prettyLogs = parsed.pretty_logs;
  const header = isRecord(prettyLogs.header) ? prettyLogs.header : {};
  const level = isRecord(prettyLogs.level) ? prettyLogs.level : {};
  const context = isRecord(prettyLogs.context) ? prettyLogs.context : {};
  return {
    enabled: typeof prettyLogs.enabled === 'boolean' ? prettyLogs.enabled : defaults.enabled,
    indent: typeof prettyLogs.indent === 'string' && prettyLogs.indent.length > 0
      ? prettyLogs.indent
      : defaults.indent,
    header: {
      timestamp: parsePrettyLogStyleTokens({
        value: header.timestamp,
        defaults: defaults.header.timestamp,
      }),
      level: parsePrettyLogStyleTokens({
        value: header.level,
        defaults: defaults.header.level,
      }),
      scope: parsePrettyLogStyleTokens({
        value: header.scope,
        defaults: defaults.header.scope,
      }),
      event: parsePrettyLogStyleTokens({
        value: header.event,
        defaults: defaults.header.event,
      }),
    },
    level: {
      info: parsePrettyLogStyleTokens({
        value: level.info,
        defaults: defaults.level.info,
      }),
      error: parsePrettyLogStyleTokens({
        value: level.error,
        defaults: defaults.level.error,
      }),
    },
    context: {
      key: parsePrettyLogStyleTokens({
        value: context.key,
        defaults: defaults.context.key,
      }),
      value: parsePrettyLogStyleTokens({
        value: context.value,
        defaults: defaults.context.value,
      }),
    },
  };
}

/**
 * Parses one style-token list from string/array inputs and filters unsupported token values.
 */
export function parsePrettyLogStyleTokens(
  args: {
    value: unknown;
    defaults: PrettyLogStyleToken[];
  },
): PrettyLogStyleToken[] {
  if (typeof args.value === 'string') {
    return isPrettyLogStyleToken({
      value: args.value,
    })
      ? [args.value as PrettyLogStyleToken]
      : args.defaults;
  }

  if (!Array.isArray(args.value)) {
    return args.defaults;
  }

  const tokens = args.value
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry): entry is PrettyLogStyleToken => isPrettyLogStyleToken({ value: entry }));
  return tokens.length > 0 ? tokens : args.defaults;
}

/**
 * Returns true when one value is a supported pretty-log style token.
 */
export function isPrettyLogStyleToken(
  args: {
    value: unknown;
  },
): args is {
  value: PrettyLogStyleToken;
} {
  if (typeof args.value !== 'string') {
    return false;
  }

  return [
    'bold',
    'dim',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
  ].includes(args.value);
}

/**
 * Returns default scheduler runtime configuration values.
 */
export function getDefaultSchedulerRuntimeSettings(): SchedulerRuntimeSettings {
  return {
    pollIntervalMs: DEFAULT_SCHEDULER_POLL_INTERVAL_MS,
    maxGlobalConcurrentRuns: DEFAULT_SCHEDULER_MAX_GLOBAL_CONCURRENT_RUNS,
    adminContactEmail: undefined,
  };
}

/**
 * Parses and validates scheduler runtime config from unknown input value.
 */
export function parseSchedulerRuntimeSettings(
  args: {
    value: unknown;
    globalAdminContactEmail?: string;
  },
): SchedulerRuntimeSettings {
  const defaults = getDefaultSchedulerRuntimeSettings();
  if (!isRecord(args.value)) {
    return defaults;
  }

  return {
    pollIntervalMs: parsePositiveIntWithDefault({
      value: args.value.poll_interval_ms,
      defaultValue: defaults.pollIntervalMs,
      fieldName: 'scheduler.poll_interval_ms',
    }),
    maxGlobalConcurrentRuns: parsePositiveIntWithDefault({
      value: args.value.max_global_concurrent_runs,
      defaultValue: defaults.maxGlobalConcurrentRuns,
      fieldName: 'scheduler.max_global_concurrent_runs',
    }),
    adminContactEmail: parseOptionalAdminContactEmail({
      value: args.value.admin_contact_email,
    }) ?? args.globalAdminContactEmail,
  };
}

/**
 * Parses and validates chat runtime config from unknown input value.
 */
export function parseChatRuntimeConfig(
  args: {
    value: unknown;
  },
): ChatRuntimeConfig {
  const defaults = getDefaultChatRuntimeConfig();
  if (!isRecord(args.value)) {
    return defaults;
  }

  const defaultDisplayMode = parseChatDisplayMode({
    value: args.value.default_display_mode,
  });
  const pollIntervalMs = parsePollIntervalMs({
    value: args.value.poll_interval_ms,
  });
  const keymap = parseChatKeymap({
    value: args.value.keymap,
  });
  return {
    defaultDisplayMode,
    pollIntervalMs,
    keymap,
  };
}

/**
 * Parses chat display mode with a strict `light|verbose` contract.
 */
export function parseChatDisplayMode(
  args: {
    value: unknown;
  },
): ChatDisplayMode {
  if (args.value === undefined) {
    return 'light';
  }

  if (args.value !== 'light' && args.value !== 'verbose') {
    throw new Error('Invalid chat.default_display_mode. Expected "light" or "verbose".');
  }

  return args.value;
}

/**
 * Parses chat poll interval and enforces positive integer semantics.
 */
export function parsePollIntervalMs(
  args: {
    value: unknown;
  },
): number {
  if (args.value === undefined) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  if (typeof args.value !== 'number' || !Number.isInteger(args.value) || args.value <= 0) {
    throw new Error('Invalid chat.poll_interval_ms. Expected a positive integer.');
  }

  return args.value;
}

/**
 * Parses one optional admin contact email and returns undefined when absent/invalid.
 */
export function parseOptionalAdminContactEmail(
  args: {
    value: unknown;
  },
): string | undefined {
  if (typeof args.value !== 'string') {
    return undefined;
  }
  const trimmed = args.value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Parses positive integer values with a default fallback and a field-level error on invalid types.
 */
export function parsePositiveIntWithDefault(
  args: {
    value: unknown;
    defaultValue: number;
    fieldName: string;
  },
): number {
  if (args.value === undefined) {
    return args.defaultValue;
  }
  if (typeof args.value !== 'number' || !Number.isInteger(args.value) || args.value <= 0) {
    throw new Error(`Invalid ${args.fieldName}. Expected a positive integer.`);
  }

  return args.value;
}

/**
 * Parses and validates required chat key bindings.
 */
export function parseChatKeymap(
  args: {
    value: unknown;
  },
): ChatKeymap {
  const defaults = getDefaultChatKeymap();
  if (!isRecord(args.value)) {
    return defaults;
  }

  const keymap: ChatKeymap = {
    send: readRequiredChatKey({
      action: 'send',
      value: args.value.send,
    }),
    refresh: readRequiredChatKey({
      action: 'refresh',
      value: args.value.refresh,
    }),
    toggle_display_mode: readRequiredChatKey({
      action: 'toggle_display_mode',
      value: args.value.toggle_display_mode,
    }),
    quit: readRequiredChatKey({
      action: 'quit',
      value: args.value.quit,
    }),
    move_selection_up: readRequiredChatKey({
      action: 'move_selection_up',
      value: args.value.move_selection_up,
    }),
    move_selection_down: readRequiredChatKey({
      action: 'move_selection_down',
      value: args.value.move_selection_down,
    }),
    open_thread: readRequiredChatKey({
      action: 'open_thread',
      value: args.value.open_thread,
    }),
    back_to_inbox: readRequiredChatKey({
      action: 'back_to_inbox',
      value: args.value.back_to_inbox,
    }),
    new_local_thread: readRequiredChatKey({
      action: 'new_local_thread',
      value: args.value.new_local_thread,
    }),
    enter_compose_mode: readRequiredChatKey({
      action: 'enter_compose_mode',
      value: args.value.enter_compose_mode,
    }),
  };

  assertChatKeymapHasNoConflicts({
    keymap,
  });
  return keymap;
}

/**
 * Reads and validates one required key binding for one named chat action.
 */
export function readRequiredChatKey(
  args: {
    action: ChatKeyAction;
    value: unknown;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new Error(`Invalid chat.keymap.${args.action}. Expected a non-empty key binding string.`);
  }

  const normalized = args.value.trim().toLowerCase();
  if (!isSupportedChatKeyBinding({
    value: normalized,
  })) {
    throw new Error(`Invalid chat.keymap.${args.action}. Unsupported key binding: ${args.value}`);
  }

  return normalized;
}

/**
 * Returns true when a chat key binding is supported by the v1 binding grammar.
 */
export function isSupportedChatKeyBinding(
  args: {
    value: string;
  },
): boolean {
  if (args.value === 'enter' || args.value === 'esc' || args.value === 'i') {
    return true;
  }

  if (args.value === 'up' || args.value === 'down') {
    return true;
  }

  if (args.value === 'ctrl+enter') {
    return true;
  }

  return /^ctrl\+[a-z]$/.test(args.value);
}

/**
 * Asserts that all chat key bindings are unique across required actions.
 */
export function assertChatKeymapHasNoConflicts(
  args: {
    keymap: ChatKeymap;
  },
): void {
  const entries = Object.entries(args.keymap) as Array<[ChatKeyAction, string]>;
  const indexByBinding = new Map<string, ChatKeyAction>();
  for (const [action, binding] of entries) {
    const existingAction = indexByBinding.get(binding);
    if (existingAction) {
      throw new Error(
        `Conflicting chat key binding "${binding}" for actions "${existingAction}" and "${action}".`,
      );
    }
    indexByBinding.set(binding, action);
  }
}

/**
 * Returns true when unknown value is a plain object record.
 */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
