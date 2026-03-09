/**
 * Represents mutable compose input state for custom chat drafting.
 */
export type ComposeInputState = {
  text: string;
  cursorIndex: number;
};

/**
 * Represents one compose input transition result.
 */
export type ComposeInputTransition = {
  state: ComposeInputState;
  handled: boolean;
};

/**
 * Builds one compose state from persisted draft text.
 */
export function createComposeInputState(
  args: {
    draft: string;
  },
): ComposeInputState {
  return {
    text: args.draft,
    cursorIndex: args.draft.length,
  };
}

/**
 * Applies one normalized key binding to compose input state.
 */
export function applyComposeInputBinding(
  args: {
    state: ComposeInputState;
    binding: string;
    printableText?: string;
  },
): ComposeInputTransition {
  if (args.binding === 'left' || args.binding === 'ctrl+b') {
    return {
      state: {
        ...args.state,
        cursorIndex: Math.max(0, args.state.cursorIndex - 1),
      },
      handled: true,
    };
  }
  if (args.binding === 'right' || args.binding === 'ctrl+f') {
    return {
      state: {
        ...args.state,
        cursorIndex: Math.min(args.state.text.length, args.state.cursorIndex + 1),
      },
      handled: true,
    };
  }
  if (args.binding === 'home' || args.binding === 'ctrl+a') {
    return {
      state: {
        ...args.state,
        cursorIndex: 0,
      },
      handled: true,
    };
  }
  if (args.binding === 'end' || args.binding === 'ctrl+e') {
    return {
      state: {
        ...args.state,
        cursorIndex: args.state.text.length,
      },
      handled: true,
    };
  }
  if (args.binding === 'backspace') {
    if (args.state.cursorIndex === 0) {
      return {
        state: args.state,
        handled: true,
      };
    }
    return {
      state: {
        text: args.state.text.slice(0, args.state.cursorIndex - 1) + args.state.text.slice(args.state.cursorIndex),
        cursorIndex: args.state.cursorIndex - 1,
      },
      handled: true,
    };
  }
  if (args.binding === 'delete' || args.binding === 'ctrl+d') {
    if (args.state.cursorIndex >= args.state.text.length) {
      return {
        state: args.state,
        handled: true,
      };
    }
    return {
      state: {
        text: args.state.text.slice(0, args.state.cursorIndex) + args.state.text.slice(args.state.cursorIndex + 1),
        cursorIndex: args.state.cursorIndex,
      },
      handled: true,
    };
  }
  if (typeof args.printableText === 'string' && args.printableText.length > 0) {
    const nextText = args.state.text.slice(0, args.state.cursorIndex)
      + args.printableText
      + args.state.text.slice(args.state.cursorIndex);
    return {
      state: {
        text: nextText,
        cursorIndex: args.state.cursorIndex + args.printableText.length,
      },
      handled: true,
    };
  }

  return {
    state: args.state,
    handled: false,
  };
}

/**
 * Renders one compose input line with a visible cursor marker.
 */
export function renderComposeInput(
  args: {
    state: ComposeInputState;
    isReadOnly: boolean;
    cursorVisible: boolean;
  },
): string {
  if (args.isReadOnly) {
    return '[read-only]';
  }
  const leftRaw = args.state.text.slice(0, args.state.cursorIndex);
  const currentRaw = args.state.text.slice(args.state.cursorIndex, args.state.cursorIndex + 1);
  const rightRaw = args.state.text.slice(args.state.cursorIndex + 1);
  const escapedLeft = escapeComposeText({
    value: leftRaw,
  });
  const escapedCurrent = escapeComposeText({
    value: currentRaw,
  });
  const escapedRight = escapeComposeText({
    value: rightRaw,
  });
  if (!args.cursorVisible) {
    return `> ${escapedLeft}${escapedCurrent}${escapedRight}`;
  }
  if (args.state.cursorIndex >= args.state.text.length) {
    return `> ${escapedLeft}{underline}_{/underline}`;
  }
  return `> ${escapedLeft}{inverse}${escapedCurrent}{/inverse}${escapedRight}`;
}

/**
 * Escapes compose text so blessed tag parsing cannot corrupt visible input.
 */
export function escapeComposeText(
  args: {
    value: string;
  },
): string {
  return args.value
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}
