import type { Widgets } from 'blessed';

/**
 * Represents one normalized keyboard event consumed by chat controller.
 */
export type ChatNormalizedKeyEvent = {
  binding: string;
  printableText?: string;
};

/**
 * Normalizes one blessed keypress tuple into a chat binding descriptor.
 */
export function normalizeBlessedKeypress(
  args: {
    ch: string;
    key: Widgets.Events.IKeyEventArg;
  },
): ChatNormalizedKeyEvent {
  const normalizedFull = (args.key.full ?? '').toLowerCase();
  if (normalizedFull === 'c-m' || normalizedFull === 'c-j' || normalizedFull === 'c-enter' || normalizedFull === 'c-return') {
    return {
      binding: 'ctrl+enter',
    };
  }

  if (args.key.ctrl && (args.key.name === 'enter' || args.key.name === 'return')) {
    return {
      binding: 'ctrl+enter',
    };
  }

  if (args.key.meta && (args.key.name === 'enter' || args.key.name === 'return')) {
    return {
      binding: 'meta+enter',
    };
  }
  if (args.key.ctrl && (args.key.name === 'm' || args.key.name === 'j' || args.key.name === 'linefeed')) {
    return {
      binding: 'ctrl+enter',
    };
  }

  if (args.key.name === 'linefeed') {
    return {
      binding: 'ctrl+enter',
    };
  }

  if (args.key.ctrl && typeof args.key.name === 'string' && args.key.name.length === 1) {
    return {
      binding: `ctrl+${args.key.name.toLowerCase()}`,
    };
  }

  if (args.key.name === 'escape') {
    return {
      binding: 'esc',
    };
  }

  if (args.key.name === 'enter') {
    return {
      binding: 'enter',
    };
  }

  if (args.key.name === 'return') {
    return {
      binding: 'enter',
    };
  }

  if (args.key.name === 'backspace') {
    return {
      binding: 'backspace',
    };
  }
  if (args.key.name === 'delete') {
    return {
      binding: 'delete',
    };
  }
  if (args.key.name === 'left') {
    return {
      binding: 'left',
    };
  }
  if (args.key.name === 'right') {
    return {
      binding: 'right',
    };
  }
  if (args.key.name === 'home') {
    return {
      binding: 'home',
    };
  }
  if (args.key.name === 'end') {
    return {
      binding: 'end',
    };
  }
  if (args.key.name === 'up') {
    return {
      binding: 'up',
    };
  }
  if (args.key.name === 'down') {
    return {
      binding: 'down',
    };
  }
  if (args.key.name === 'pageup') {
    return {
      binding: 'pageup',
    };
  }
  if (args.key.name === 'pagedown') {
    return {
      binding: 'pagedown',
    };
  }

  if (typeof args.ch === 'string' && args.ch.length === 1) {
    return {
      binding: args.ch === ' ' ? 'space' : args.ch.toLowerCase(),
      printableText: args.ch,
    };
  }

  return {
    binding: args.key.full ?? '',
  };
}
