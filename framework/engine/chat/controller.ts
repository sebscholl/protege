import type { ChatDisplayMode, ChatKeymap } from '@engine/shared/runtime-config';

/**
 * Represents top-level chat view states.
 */
export type ChatView = 'inbox' | 'thread';

/**
 * Represents chat interaction modes used for safe compose behavior.
 */
export type ChatInteractionMode = 'command' | 'compose';

/**
 * Represents one mutable chat session state snapshot.
 */
export type ChatSessionState = {
  view: ChatView;
  mode: ChatInteractionMode;
  displayMode: ChatDisplayMode;
  selectedThreadId?: string;
  isCurrentThreadReadOnly: boolean;
  draft: string;
  shouldQuit: boolean;
};

/**
 * Represents one normalized keyboard input event.
 */
export type ChatInputEvent = {
  binding: string;
  printableText?: string;
};

/**
 * Represents one normalized controller action.
 */
export type ChatControllerAction =
  | { type: 'quit' }
  | { type: 'refresh' }
  | { type: 'toggle_display_mode' }
  | { type: 'open_thread'; threadId: string; isReadOnly: boolean }
  | { type: 'back_to_inbox' }
  | { type: 'new_local_thread'; threadId: string }
  | { type: 'enter_command_mode' }
  | { type: 'enter_compose_mode' }
  | { type: 'append_text'; text: string }
  | { type: 'delete_backward' }
  | { type: 'send' }
  | { type: 'blocked_send_read_only' }
  | { type: 'none' };

/**
 * Represents controller side effects emitted from state transitions.
 */
export type ChatControllerEffect =
  | { type: 'quit_requested' }
  | { type: 'refresh_requested' }
  | { type: 'send_blocked_read_only' }
  | { type: 'send_requested'; threadId: string; draft: string };

/**
 * Represents one state transition result.
 */
export type ChatControllerTransition = {
  state: ChatSessionState;
  effects: ChatControllerEffect[];
};

/**
 * Builds one initial chat session state from startup defaults.
 */
export function createInitialChatSessionState(
  args: {
    defaultDisplayMode: ChatDisplayMode;
  },
): ChatSessionState {
  return {
    view: 'inbox',
    mode: 'command',
    displayMode: args.defaultDisplayMode,
    isCurrentThreadReadOnly: true,
    draft: '',
    shouldQuit: false,
  };
}

/**
 * Resolves one keyboard input event into one controller action.
 */
export function resolveChatActionFromInput(
  args: {
    state: ChatSessionState;
    keymap: ChatKeymap;
    event: ChatInputEvent;
  },
): ChatControllerAction {
  const binding = args.event.binding.toLowerCase();
  const globalAction = resolveGlobalBindingAction({
    keymap: args.keymap,
    binding,
  });
  if (globalAction) {
    return globalAction;
  }

  if (args.state.view === 'inbox') {
    if (binding === args.keymap.open_thread) {
      return { type: 'none' };
    }
    if (binding === args.keymap.new_local_thread) {
      return { type: 'none' };
    }

    return { type: 'none' };
  }

  if (args.state.mode === 'compose') {
    if (isSendBinding({
      binding,
      keymap: args.keymap,
    })) {
      return args.state.isCurrentThreadReadOnly ? { type: 'blocked_send_read_only' } : { type: 'send' };
    }
    if (binding === 'esc') {
      return { type: 'enter_command_mode' };
    }
    if (binding === 'backspace') {
      return { type: 'delete_backward' };
    }
    if (args.event.printableText && args.event.printableText.length > 0) {
      return { type: 'append_text', text: args.event.printableText };
    }

    return { type: 'none' };
  }

  if (binding === args.keymap.enter_compose_mode) {
    return { type: 'enter_compose_mode' };
  }
  if (isSendBinding({
    binding,
    keymap: args.keymap,
  })) {
    return args.state.isCurrentThreadReadOnly ? { type: 'blocked_send_read_only' } : { type: 'send' };
  }
  if (binding === args.keymap.back_to_inbox) {
    return { type: 'back_to_inbox' };
  }

  return { type: 'none' };
}

/**
 * Returns true when one binding should trigger the send action.
 */
export function isSendBinding(
  args: {
    binding: string;
    keymap: ChatKeymap;
  },
): boolean {
  return args.binding === args.keymap.send || args.binding === 'ctrl+enter';
}

/**
 * Applies one controller action and returns next state and side effects.
 */
export function applyChatControllerAction(
  args: {
    state: ChatSessionState;
    action: ChatControllerAction;
  },
): ChatControllerTransition {
  const state = { ...args.state };
  const effects: ChatControllerEffect[] = [];

  if (args.action.type === 'quit') {
    state.shouldQuit = true;
    effects.push({ type: 'quit_requested' });
    return { state, effects };
  }

  if (args.action.type === 'refresh') {
    effects.push({ type: 'refresh_requested' });
    return { state, effects };
  }

  if (args.action.type === 'toggle_display_mode') {
    state.displayMode = state.displayMode === 'light' ? 'verbose' : 'light';
    return { state, effects };
  }

  if (args.action.type === 'open_thread') {
    state.view = 'thread';
    state.selectedThreadId = args.action.threadId;
    state.isCurrentThreadReadOnly = args.action.isReadOnly;
    state.mode = args.action.isReadOnly ? 'command' : 'compose';
    state.draft = '';
    return { state, effects };
  }

  if (args.action.type === 'new_local_thread') {
    state.view = 'thread';
    state.selectedThreadId = args.action.threadId;
    state.isCurrentThreadReadOnly = false;
    state.mode = 'compose';
    state.draft = '';
    return { state, effects };
  }

  if (args.action.type === 'back_to_inbox') {
    state.view = 'inbox';
    state.mode = 'command';
    state.selectedThreadId = undefined;
    state.isCurrentThreadReadOnly = true;
    state.draft = '';
    return { state, effects };
  }

  if (args.action.type === 'enter_command_mode') {
    state.mode = 'command';
    return { state, effects };
  }

  if (args.action.type === 'enter_compose_mode') {
    if (state.view === 'thread' && !state.isCurrentThreadReadOnly) {
      state.mode = 'compose';
    }
    return { state, effects };
  }

  if (args.action.type === 'append_text') {
    if (state.view === 'thread' && state.mode === 'compose' && !state.isCurrentThreadReadOnly) {
      state.draft += args.action.text;
    }
    return { state, effects };
  }

  if (args.action.type === 'delete_backward') {
    if (state.view === 'thread' && state.mode === 'compose' && !state.isCurrentThreadReadOnly) {
      state.draft = state.draft.slice(0, -1);
    }
    return { state, effects };
  }

  if (args.action.type === 'send') {
    if (state.view === 'thread' && !state.isCurrentThreadReadOnly && state.selectedThreadId && state.draft.trim()) {
      effects.push({
        type: 'send_requested',
        threadId: state.selectedThreadId,
        draft: state.draft,
      });
      state.draft = '';
    }
    return { state, effects };
  }

  if (args.action.type === 'blocked_send_read_only') {
    effects.push({
      type: 'send_blocked_read_only',
    });
    return { state, effects };
  }

  return { state, effects };
}

/**
 * Dispatches one input event through action resolution and reducer transition.
 */
export function dispatchChatInputEvent(
  args: {
    state: ChatSessionState;
    keymap: ChatKeymap;
    event: ChatInputEvent;
  },
): ChatControllerTransition {
  const action = resolveChatActionFromInput({
    state: args.state,
    keymap: args.keymap,
    event: args.event,
  });
  return applyChatControllerAction({
    state: args.state,
    action,
  });
}

/**
 * Resolves one binding to global controller actions valid in all views/modes.
 */
export function resolveGlobalBindingAction(
  args: {
    keymap: ChatKeymap;
    binding: string;
  },
): ChatControllerAction | undefined {
  if (args.binding === args.keymap.quit) {
    return { type: 'quit' };
  }
  if (args.binding === args.keymap.refresh) {
    return { type: 'refresh' };
  }
  if (args.binding === args.keymap.toggle_display_mode) {
    return { type: 'toggle_display_mode' };
  }

  return undefined;
}
