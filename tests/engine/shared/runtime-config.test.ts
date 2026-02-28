import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

let tempRootPath = '';
let parsedLogsDirPath = '';
let parsedConsoleFormat = '';
let parsedGlobalAdminContactEmail = '';
let parsedChatDisplayMode = '';
let parsedChatPollIntervalMs = 0;
let parsedChatSendBinding = '';
let parsedSchedulerPollIntervalMs = 0;
let parsedSchedulerMaxGlobalConcurrentRuns = 0;
let parsedSchedulerAdminContactEmail = '';
let parsedPrettyThemeEnabled = false;
let parsedPrettyThemeIndent = '';
let parsedPrettyThemeScopeToken = '';
let parsedChatUiInboxTitleTag = '';
let parsedChatUiInboxTitleTagCount = 0;
let parsedChatUiInboxSelectedMarkerTag = '';
let parsedChatUiInboxRowGapLines = 0;
let parsedChatUiInboxMarkerGlyphLength = 0;
let parsedChatUiStatusPrefixTag = '';
let defaultChatUiStatusDividerTag = '';
let parsedChatUiThreadHeaderTag = '';
let defaultChatUiThreadDotTag = '';
let defaultChatDisplayMode = '';
let defaultChatPollIntervalMs = 0;
let defaultChatSendBinding = '';
let defaultSchedulerPollIntervalMs = 0;
let defaultSchedulerMaxGlobalConcurrentRuns = 0;
let defaultPrettyThemeEnabled = false;
let defaultChatUiUnselectedMarkerTag = '';
let invalidModeError = '';
let missingActionError = '';
let duplicateBindingError = '';
let unsupportedBindingError = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-config-'));
  const validConfigPath = join(tempRootPath, 'valid-system.json');
  const validThemePath = join(tempRootPath, 'valid-theme.json');
  writeFileSync(validThemePath, JSON.stringify({
    pretty_logs: {
      enabled: true,
      indent: '  ',
      header: {
        scope: ['yellow'],
      },
    },
    chat_ui: {
      inbox: {
        title_tag: 'cyan-fg',
        selected_marker_tag: 'magenta-fg',
        marker_glyph: '  ',
        row_gap_lines: 2,
      },
      status: {
        prefix_tag: ['white-fg'],
      },
      thread: {
        message_header_tag: ['green-fg'],
      },
    },
  }));
  writeFileSync(validConfigPath, JSON.stringify({
    logs_dir_path: 'tmp/logs',
    console_log_format: 'pretty',
    theme_config_path: validThemePath,
    admin_contact_email: 'global-alerts@example.com',
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
        scroll_thread_up: 'up',
        scroll_thread_down: 'down',
        scroll_thread_page_up: 'pageup',
        scroll_thread_page_down: 'pagedown',
        compose_cursor_left: 'left',
        compose_cursor_right: 'right',
        compose_cursor_home: 'home',
        compose_cursor_end: 'end',
        compose_delete_backward: 'backspace',
        compose_delete_forward: 'delete',
      },
    },
    scheduler: {
      poll_interval_ms: 1000,
      max_global_concurrent_runs: 6,
      admin_contact_email: 'alerts@example.com',
    },
  }));

  const parsed = readGlobalRuntimeConfig({ configPath: validConfigPath });
  parsedLogsDirPath = parsed.logsDirPath;
  parsedConsoleFormat = parsed.consoleLogFormat;
  parsedGlobalAdminContactEmail = parsed.adminContactEmail ?? '';
  parsedChatDisplayMode = parsed.chat.defaultDisplayMode;
  parsedChatPollIntervalMs = parsed.chat.pollIntervalMs;
  parsedChatSendBinding = parsed.chat.keymap.send;
  parsedSchedulerPollIntervalMs = parsed.scheduler.pollIntervalMs;
  parsedSchedulerMaxGlobalConcurrentRuns = parsed.scheduler.maxGlobalConcurrentRuns;
  parsedSchedulerAdminContactEmail = parsed.scheduler.adminContactEmail ?? '';
  parsedPrettyThemeEnabled = parsed.prettyLogTheme.enabled;
  parsedPrettyThemeIndent = parsed.prettyLogTheme.indent;
  parsedPrettyThemeScopeToken = parsed.prettyLogTheme.header.scope[0] ?? '';
  parsedChatUiInboxTitleTag = parsed.chatUiTheme.inbox.titleTag[0] ?? '';
  parsedChatUiInboxTitleTagCount = parsed.chatUiTheme.inbox.titleTag.length;
  parsedChatUiInboxSelectedMarkerTag = parsed.chatUiTheme.inbox.selectedMarkerTag[0] ?? '';
  parsedChatUiInboxRowGapLines = parsed.chatUiTheme.inbox.rowGapLines;
  parsedChatUiInboxMarkerGlyphLength = parsed.chatUiTheme.inbox.markerGlyph.length;
  parsedChatUiStatusPrefixTag = parsed.chatUiTheme.status.prefixTag[0] ?? '';
  parsedChatUiThreadHeaderTag = parsed.chatUiTheme.thread.messageHeaderTag[0] ?? '';

  const defaultConfigPath = join(tempRootPath, 'default-system.json');
  writeFileSync(defaultConfigPath, JSON.stringify({
    logs_dir_path: 'tmp/logs',
    console_log_format: 'json',
    theme_config_path: join(tempRootPath, 'missing-theme.json'),
  }));
  const defaultParsed = readGlobalRuntimeConfig({ configPath: defaultConfigPath });
  defaultChatDisplayMode = defaultParsed.chat.defaultDisplayMode;
  defaultChatPollIntervalMs = defaultParsed.chat.pollIntervalMs;
  defaultChatSendBinding = defaultParsed.chat.keymap.send;
  defaultSchedulerPollIntervalMs = defaultParsed.scheduler.pollIntervalMs;
  defaultSchedulerMaxGlobalConcurrentRuns = defaultParsed.scheduler.maxGlobalConcurrentRuns;
  defaultPrettyThemeEnabled = defaultParsed.prettyLogTheme.enabled;
  defaultChatUiUnselectedMarkerTag = defaultParsed.chatUiTheme.inbox.unselectedMarkerTag[0] ?? '';
  defaultChatUiStatusDividerTag = defaultParsed.chatUiTheme.status.dividerTag[0] ?? '';
  defaultChatUiThreadDotTag = defaultParsed.chatUiTheme.thread.messageDotTag[0] ?? '';

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
        scroll_thread_up: 'up',
        scroll_thread_down: 'down',
        scroll_thread_page_up: 'pageup',
        scroll_thread_page_down: 'pagedown',
        compose_cursor_left: 'left',
        compose_cursor_right: 'right',
        compose_cursor_home: 'home',
        compose_cursor_end: 'end',
        compose_delete_backward: 'backspace',
        compose_delete_forward: 'delete',
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
        scroll_thread_up: 'up',
        scroll_thread_down: 'down',
        scroll_thread_page_up: 'pageup',
        scroll_thread_page_down: 'pagedown',
        compose_cursor_left: 'left',
        compose_cursor_right: 'right',
        compose_cursor_home: 'home',
        compose_cursor_end: 'end',
        compose_delete_backward: 'backspace',
        compose_delete_forward: 'delete',
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
        scroll_thread_up: 'up',
        scroll_thread_down: 'down',
        scroll_thread_page_up: 'pageup',
        scroll_thread_page_down: 'pagedown',
        compose_cursor_left: 'left',
        compose_cursor_right: 'right',
        compose_cursor_home: 'home',
        compose_cursor_end: 'end',
        compose_delete_backward: 'backspace',
        compose_delete_forward: 'delete',
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

  it('parses configured global admin contact email', () => {
    expect(parsedGlobalAdminContactEmail).toBe('global-alerts@example.com');
  });

  it('parses configured pretty-log theme values from theme config path', () => {
    expect([parsedPrettyThemeEnabled, parsedPrettyThemeIndent, parsedPrettyThemeScopeToken]).toEqual([true, '  ', 'yellow']);
  });

  it('applies default pretty-log theme when theme config path is absent', () => {
    expect(defaultPrettyThemeEnabled).toBe(true);
  });

  it('parses configured chat-ui inbox theme values from theme config path', () => {
    expect([
      parsedChatUiInboxTitleTag,
      parsedChatUiInboxTitleTagCount,
      parsedChatUiInboxSelectedMarkerTag,
      parsedChatUiInboxRowGapLines,
      parsedChatUiInboxMarkerGlyphLength,
    ]).toEqual(['cyan-fg', 1, 'magenta-fg', 2, 2]);
  });

  it('parses configured chat-ui status theme values from theme config path', () => {
    expect(parsedChatUiStatusPrefixTag).toBe('white-fg');
  });

  it('parses configured chat-ui thread theme values from theme config path', () => {
    expect(parsedChatUiThreadHeaderTag).toBe('green-fg');
  });

  it('applies default chat-ui theme values when theme config path is absent', () => {
    expect(defaultChatUiUnselectedMarkerTag).toBe('gray-fg');
  });

  it('applies default chat-ui status theme values when theme config path is absent', () => {
    expect(defaultChatUiStatusDividerTag).toBe('gray-fg');
  });

  it('applies default chat-ui thread theme values when theme config path is absent', () => {
    expect(defaultChatUiThreadDotTag).toBe('blue-fg');
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

describe('scheduler runtime config parsing', () => {
  it('parses configured scheduler poll interval', () => {
    expect(parsedSchedulerPollIntervalMs).toBe(1000);
  });

  it('parses configured scheduler max global concurrency', () => {
    expect(parsedSchedulerMaxGlobalConcurrentRuns).toBe(6);
  });

  it('parses configured scheduler admin contact email', () => {
    expect(parsedSchedulerAdminContactEmail).toBe('alerts@example.com');
  });

  it('applies default scheduler poll interval when scheduler config is absent', () => {
    expect(defaultSchedulerPollIntervalMs).toBe(1000);
  });

  it('applies default scheduler global concurrency when scheduler config is absent', () => {
    expect(defaultSchedulerMaxGlobalConcurrentRuns).toBe(5);
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
