import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

let tempRootPath = '';
let parsedLogsDirPath = '';
let parsedConsoleFormat = '';
let parsedChatDisplayMode = '';
let parsedChatPollIntervalMs = 0;
let parsedChatSendBinding = '';
let defaultChatDisplayMode = '';
let defaultChatPollIntervalMs = 0;
let defaultChatSendBinding = '';
let invalidModeError = '';
let missingActionError = '';
let duplicateBindingError = '';
let unsupportedBindingError = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-config-'));
  const validConfigPath = join(tempRootPath, 'valid-system.json');
  writeFileSync(validConfigPath, JSON.stringify({
    logs_dir_path: 'tmp/logs',
    console_log_format: 'pretty',
    chat: {
      default_display_mode: 'verbose',
      poll_interval_ms: 900,
      keymap: {
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
      },
    },
  }));

  const parsed = readGlobalRuntimeConfig({ configPath: validConfigPath });
  parsedLogsDirPath = parsed.logsDirPath;
  parsedConsoleFormat = parsed.consoleLogFormat;
  parsedChatDisplayMode = parsed.chat.defaultDisplayMode;
  parsedChatPollIntervalMs = parsed.chat.pollIntervalMs;
  parsedChatSendBinding = parsed.chat.keymap.send;

  const defaultConfigPath = join(tempRootPath, 'default-system.json');
  writeFileSync(defaultConfigPath, JSON.stringify({
    logs_dir_path: 'tmp/logs',
    console_log_format: 'json',
  }));
  const defaultParsed = readGlobalRuntimeConfig({ configPath: defaultConfigPath });
  defaultChatDisplayMode = defaultParsed.chat.defaultDisplayMode;
  defaultChatPollIntervalMs = defaultParsed.chat.pollIntervalMs;
  defaultChatSendBinding = defaultParsed.chat.keymap.send;

  const invalidModePath = join(tempRootPath, 'invalid-mode-system.json');
  writeFileSync(invalidModePath, JSON.stringify({
    chat: {
      default_display_mode: 'compact',
      keymap: {
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
      },
    },
  }));
  try {
    readGlobalRuntimeConfig({ configPath: invalidModePath });
  } catch (error) {
    invalidModeError = error instanceof Error ? error.message : String(error);
  }

  const missingActionPath = join(tempRootPath, 'missing-action-system.json');
  writeFileSync(missingActionPath, JSON.stringify({
    chat: {
      keymap: {
        send: 'ctrl+s',
        refresh: 'ctrl+r',
        toggle_display_mode: 'ctrl+v',
        quit: 'ctrl+q',
        open_thread: 'enter',
        back_to_inbox: 'esc',
        new_local_thread: 'ctrl+n',
      },
    },
  }));
  try {
    readGlobalRuntimeConfig({ configPath: missingActionPath });
  } catch (error) {
    missingActionError = error instanceof Error ? error.message : String(error);
  }

  const duplicateBindingPath = join(tempRootPath, 'duplicate-binding-system.json');
  writeFileSync(duplicateBindingPath, JSON.stringify({
    chat: {
      keymap: {
        send: 'ctrl+s',
        refresh: 'ctrl+r',
        toggle_display_mode: 'ctrl+v',
        quit: 'ctrl+q',
        move_selection_up: 'up',
        move_selection_down: 'down',
        open_thread: 'enter',
        back_to_inbox: 'esc',
        new_local_thread: 'ctrl+r',
        enter_compose_mode: 'i',
      },
    },
  }));
  try {
    readGlobalRuntimeConfig({ configPath: duplicateBindingPath });
  } catch (error) {
    duplicateBindingError = error instanceof Error ? error.message : String(error);
  }

  const unsupportedBindingPath = join(tempRootPath, 'unsupported-binding-system.json');
  writeFileSync(unsupportedBindingPath, JSON.stringify({
    chat: {
      keymap: {
        send: 'cmd+enter',
        refresh: 'ctrl+r',
        toggle_display_mode: 'ctrl+v',
        quit: 'ctrl+q',
        move_selection_up: 'up',
        move_selection_down: 'down',
        open_thread: 'enter',
        back_to_inbox: 'esc',
        new_local_thread: 'ctrl+n',
        enter_compose_mode: 'i',
      },
    },
  }));
  try {
    readGlobalRuntimeConfig({ configPath: unsupportedBindingPath });
  } catch (error) {
    unsupportedBindingError = error instanceof Error ? error.message : String(error);
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('global runtime config', () => {
  it('parses configured logs directory path', () => {
    expect(parsedLogsDirPath).toBe('tmp/logs');
  });

  it('parses configured pretty console log format', () => {
    expect(parsedConsoleFormat).toBe('pretty');
  });
});

describe('chat runtime config parsing', () => {
  it('parses configured display mode', () => {
    expect(parsedChatDisplayMode).toBe('verbose');
  });

  it('parses configured poll interval', () => {
    expect(parsedChatPollIntervalMs).toBe(900);
  });

  it('parses configured key bindings', () => {
    expect(parsedChatSendBinding).toBe('ctrl+s');
  });

  it('applies default display mode when chat config is absent', () => {
    expect(defaultChatDisplayMode).toBe('light');
  });

  it('applies default poll interval when chat config is absent', () => {
    expect(defaultChatPollIntervalMs).toBe(1500);
  });

  it('applies default key bindings when chat config is absent', () => {
    expect(defaultChatSendBinding).toBe('ctrl+s');
  });
});

describe('chat runtime config validation', () => {
  it('rejects unsupported display mode', () => {
    expect(invalidModeError).toContain('chat.default_display_mode');
  });

  it('rejects missing key action bindings', () => {
    expect(missingActionError).toContain('chat.keymap.move_selection_up');
  });

  it('rejects duplicate key bindings', () => {
    expect(duplicateBindingError).toContain('Conflicting chat key binding');
  });

  it('rejects unsupported key binding values', () => {
    expect(unsupportedBindingError).toContain('Unsupported key binding');
  });
});
