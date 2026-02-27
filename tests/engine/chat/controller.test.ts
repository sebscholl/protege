import type { ChatKeymap } from '@engine/shared/runtime-config';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  applyChatControllerAction,
  createInitialChatSessionState,
  dispatchChatInputEvent,
} from '@engine/chat/controller';

const keymap: ChatKeymap = {
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
};

let openThreadView = '';
let backToInboxView = '';
let composeTypedDraft = '';
let composeTypedMode = '';
let toggledDisplayMode = '';
let quitRequested = false;
let readOnlySendEffectsCount = -1;
let readOnlyBlockedEffectsCount = -1;
let writableSendEffectsCount = -1;
let writableSendDraftCleared = false;
let writableLegacySendEffectsCount = -1;

beforeAll((): void => {
  const baseState = createInitialChatSessionState({
    defaultDisplayMode: 'light',
  });
  const opened = applyChatControllerAction({
    state: baseState,
    action: {
      type: 'open_thread',
      threadId: 'thread-1',
      isReadOnly: false,
    },
  });
  openThreadView = opened.state.view;

  const back = applyChatControllerAction({
    state: opened.state,
    action: {
      type: 'back_to_inbox',
    },
  });
  backToInboxView = back.state.view;

  const composeInput = dispatchChatInputEvent({
    state: opened.state,
    keymap,
    event: {
      binding: 'h',
      printableText: 'h',
    },
  });
  composeTypedDraft = composeInput.state.draft;
  composeTypedMode = composeInput.state.mode;

  const toggled = dispatchChatInputEvent({
    state: opened.state,
    keymap,
    event: {
      binding: 'ctrl+v',
    },
  });
  toggledDisplayMode = toggled.state.displayMode;

  const quit = dispatchChatInputEvent({
    state: opened.state,
    keymap,
    event: {
      binding: 'ctrl+q',
    },
  });
  quitRequested = quit.effects.some((effect) => effect.type === 'quit_requested');

  const readOnlyOpened = applyChatControllerAction({
    state: baseState,
    action: {
      type: 'open_thread',
      threadId: 'thread-read-only',
      isReadOnly: true,
    },
  });
  const readOnlyAttempt = dispatchChatInputEvent({
    state: readOnlyOpened.state,
    keymap,
    event: {
      binding: 'ctrl+enter',
    },
  });
  readOnlySendEffectsCount = readOnlyAttempt.effects.filter((effect) => effect.type === 'send_requested').length;
  readOnlyBlockedEffectsCount = readOnlyAttempt.effects.filter((effect) => effect.type === 'send_blocked_read_only').length;

  const writableWithDraft = applyChatControllerAction({
    state: opened.state,
    action: {
      type: 'append_text',
      text: 'hello',
    },
  });
  const writableSend = dispatchChatInputEvent({
    state: writableWithDraft.state,
    keymap,
    event: {
      binding: 'ctrl+s',
    },
  });
  writableSendEffectsCount = writableSend.effects.filter((effect) => effect.type === 'send_requested').length;
  writableSendDraftCleared = writableSend.state.draft.length === 0;

  const writableWithDraftLegacy = applyChatControllerAction({
    state: opened.state,
    action: {
      type: 'append_text',
      text: 'legacy',
    },
  });
  const writableLegacySend = dispatchChatInputEvent({
    state: writableWithDraftLegacy.state,
    keymap,
    event: {
      binding: 'ctrl+enter',
    },
  });
  writableLegacySendEffectsCount = writableLegacySend.effects.filter((effect) => effect.type === 'send_requested').length;

});

describe('chat controller transitions', () => {
  it('supports inbox to thread transition', () => {
    expect(openThreadView).toBe('thread');
  });

  it('supports thread to inbox transition', () => {
    expect(backToInboxView).toBe('inbox');
  });
});

describe('chat compose safety behavior', () => {
  it('treats printable input as draft text in compose mode', () => {
    expect(composeTypedDraft).toBe('h');
  });

  it('keeps compose mode active while typing', () => {
    expect(composeTypedMode).toBe('compose');
  });
});

describe('chat global command bindings', () => {
  it('toggles display mode globally with ctrl+v', () => {
    expect(toggledDisplayMode).toBe('verbose');
  });

  it('emits quit effect with ctrl+q', () => {
    expect(quitRequested).toBe(true);
  });
});

describe('chat thread write policy enforcement', () => {
  it('blocks send effects in read-only threads', () => {
    expect(readOnlySendEffectsCount).toBe(0);
  });

  it('emits blocked-send feedback effect in read-only threads', () => {
    expect(readOnlyBlockedEffectsCount).toBe(1);
  });

  it('emits one send effect in writable threads', () => {
    expect(writableSendEffectsCount).toBe(1);
  });

  it('clears draft after successful writable send action', () => {
    expect(writableSendDraftCleared).toBe(true);
  });

  it('keeps ctrl+enter as a legacy send fallback', () => {
    expect(writableLegacySendEffectsCount).toBe(1);
  });
});
