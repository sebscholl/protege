import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { HarnessRuntimeActionInvoker } from '@engine/harness/runtime';
import type { GatewayLogger } from '@engine/gateway/types';
import type { ChatUiTheme } from '@engine/shared/runtime-config';

import { randomUUID } from 'node:crypto';

import blessed from 'neo-blessed';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { dispatchChatInputEvent, applyChatControllerAction, createInitialChatSessionState } from '@engine/chat/controller';
import { normalizeBlessedKeypress } from '@engine/chat/keys';
import { listChatThreadSummaries, readChatThreadDetail } from '@engine/chat/queries';
import { buildInboxViewModel, buildThreadViewModel } from '@engine/chat/view-model';
import { createLocalChatThreadSeed, storeLocalChatUserMessage } from '@engine/chat/writes';
import { resolveMigrationsDirPath, runHarnessForPersistedInboundMessage } from '@engine/harness/runtime';
import { storeOutboundMessage } from '@engine/harness/storage';
import { initializeDatabase } from '@engine/shared/database';
import { createUnifiedLogger } from '@engine/shared/logger';
import { resolvePersonaBySelector as resolvePersonaBySelectorShared } from '@engine/shared/persona-selector';
import { listPersonas, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

/**
 * Represents runtime options for starting one interactive chat TUI session.
 */
export type StartChatRuntimeOptions = {
  personaSelector: string;
  threadId?: string;
};

/**
 * Starts one interactive chat TUI session for the selected persona.
 */
export async function startChatRuntime(
  args: StartChatRuntimeOptions,
): Promise<void> {
  const globalConfig = readGlobalRuntimeConfig();
  const persona = resolvePersonaBySelector({
    selector: args.personaSelector,
  });
  const personaMailboxIdentity = `${persona.emailLocalPart}@localhost`;
  const logger = createUnifiedLogger({
    logsDirPath: globalConfig.logsDirPath,
    scope: 'chat',
    consoleLogFormat: globalConfig.consoleLogFormat,
    prettyLogTheme: globalConfig.prettyLogTheme,
    emitToConsole: false,
  });
  const personaMemoryPaths = resolvePersonaMemoryPaths({
    personaId: persona.personaId,
  });
  const db = initializeDatabase({
    databasePath: personaMemoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  const screen = blessed.screen({
    smartCSR: true,
    title: `Protege Chat: ${persona.personaId}`,
  });
  const inboxList = blessed.box({
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-3',
    keys: false,
    mouse: false,
    scrollable: true,
    alwaysScroll: true,
    border: 'line',
    tags: true,
  });
  const threadBox = blessed.box({
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-8',
    scrollable: true,
    alwaysScroll: true,
    border: 'line',
    tags: false,
  });
  const composeBox = blessed.box({
    top: '100%-7',
    left: 1,
    width: '100%-2',
    height: 5,
    border: 'line',
    tags: false,
  });
  const statusBar = blessed.box({
    top: '100%-2',
    left: 1,
    width: '100%-2',
    height: 1,
    tags: true,
  });

  screen.append(inboxList);
  screen.append(threadBox);
  screen.append(composeBox);
  screen.append(statusBar);

  let selectedInboxIndex = 0;
  let inboxTopRowIndex = 0;
  let statusMessage = '';
  let runtimeClosed = false;
  let state = createInitialChatSessionState({
    defaultDisplayMode: globalConfig.chat.defaultDisplayMode,
  });
  let shouldScrollThreadToBottom = false;
  let summaries = listChatThreadSummaries({
    db,
    personaMailboxIdentity,
  });
  if (args.threadId) {
    const thread = summaries.find((item) => item.threadId === args.threadId);
    if (thread) {
      const transition = applyChatControllerAction({
        state,
        action: {
          type: 'open_thread',
          threadId: thread.threadId,
          isReadOnly: thread.isReadOnly,
        },
      });
      state = transition.state;
      selectedInboxIndex = summaries.findIndex((item) => item.threadId === thread.threadId);
      shouldScrollThreadToBottom = true;
    }
  }

  /**
   * Refreshes in-memory thread summaries from persona temporal storage.
   */
  function refreshSummaries(): void {
    summaries = listChatThreadSummaries({
      db,
      personaMailboxIdentity,
    });
    if (selectedInboxIndex >= summaries.length) {
      selectedInboxIndex = Math.max(0, summaries.length - 1);
    }
  }

  /**
   * Renders current chat session view state to blessed widgets.
   */
  function render(): void {
    if (state.view === 'inbox') {
      const inboxViewModel = buildInboxViewModel({
        state: {
          ...state,
          selectedThreadId: summaries[selectedInboxIndex]?.threadId,
        },
        summaries,
      });
      inboxList.show();
      threadBox.hide();
      composeBox.hide();
      inboxList.setContent(renderInboxRows({
        rows: inboxViewModel.rows,
        selectedIndex: selectedInboxIndex,
        theme: globalConfig.chatUiTheme,
      }));
      inboxTopRowIndex = computeNextInboxTopRowIndex({
        currentTopRowIndex: inboxTopRowIndex,
        selectedIndex: selectedInboxIndex,
        visibleRowCount: readVisibleInboxRowCount({
          rowHeightLines: 3 + globalConfig.chatUiTheme.inbox.rowGapLines,
          inboxList: inboxList as unknown as {
            height: number;
          },
        }),
      });
      inboxList.setScroll(inboxTopRowIndex * (3 + globalConfig.chatUiTheme.inbox.rowGapLines));
      statusBar.setContent(
        buildStatusLine({
          view: 'inbox',
          displayModeLabel: inboxViewModel.modeLabel,
          footerHint: inboxViewModel.footerHint,
          statusMessage,
          theme: globalConfig.chatUiTheme,
        }),
      );
      screen.render();
      return;
    }

    const threadId = state.selectedThreadId;
    const detail = threadId
      ? readChatThreadDetail({
        db,
        threadId,
        personaMailboxIdentity,
      })
      : {
        threadId: '',
        subject: '',
        messages: [],
        isReadOnly: true,
      };
    const threadViewModel = buildThreadViewModel({
      state,
      detail,
    });
    inboxList.hide();
    threadBox.show();
    composeBox.show();
    threadBox.setContent(applyHorizontalPadding({
      content: [
        `${threadViewModel.title} (${threadViewModel.modeLabel} | ${state.mode.toUpperCase()})`,
        '',
        threadViewModel.writeBanner,
        '',
        ...threadViewModel.messages.flatMap((message) => [message.header, message.body, '']),
      ].join('\n'),
    }));
    composeBox.setContent(applyHorizontalPadding({
      content: threadViewModel.composeEnabled ? threadViewModel.draft : '[read-only]',
    }));
    statusBar.setContent(
      buildStatusLine({
        view: state.view,
        displayModeLabel: threadViewModel.modeLabel,
        footerHint: threadViewModel.footerHint,
        statusMessage,
        theme: globalConfig.chatUiTheme,
      }),
    );
    if (shouldScrollThreadToBottom) {
      scrollThreadBoxToBottom({
        threadBox,
      });
      shouldScrollThreadToBottom = false;
    }
    screen.render();
  }

  /**
   * Periodically refreshes chat summaries/details based on configured poll interval.
   */
  const pollTimer = setInterval(() => {
    if (runtimeClosed) {
      return;
    }

    refreshSummaries();
    render();
  }, globalConfig.chat.pollIntervalMs);

  /**
   * Handles send effect by persisting local user message and running harness inference.
   */
  async function handleSendRequested(
    effect: {
      type: 'send_requested';
      threadId: string;
      draft: string;
    },
  ): Promise<void> {
    statusMessage = 'Sending...';
    render();
    const stored = storeLocalChatUserMessage({
      db,
      threadId: effect.threadId,
      personaMailboxIdentity,
      text: effect.draft,
    });
    shouldScrollThreadToBottom = true;
    render();
    const references = readChatThreadDetail({
      db,
      threadId: effect.threadId,
      personaMailboxIdentity,
    }).messages.map((message) => message.messageId);
    const inboundMessage: InboundNormalizedMessage = {
      personaId: persona.personaId,
      messageId: stored.messageId,
      threadId: stored.threadId,
      from: [{ address: 'user@localhost' }],
      to: [{ address: personaMailboxIdentity }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: personaMailboxIdentity }],
      subject: stored.subject,
      text: stored.text,
      html: undefined,
      references,
      receivedAt: stored.receivedAt,
      rawMimePath: '__chat_local_message__',
      attachments: [],
    };
    try {
      await runHarnessForPersistedInboundMessage({
        message: inboundMessage,
        senderAddress: personaMailboxIdentity,
        suppressFinalResponsePersistenceWhenActions: ['email.send'],
        invokeRuntimeAction: createChatRuntimeActionInvoker({
          db,
          message: inboundMessage,
          logger,
          personaMailboxIdentity,
        }),
        logger,
      });
      statusMessage = 'Sent';
      shouldScrollThreadToBottom = true;
    } catch (error) {
      statusMessage = `Send failed: ${(error as Error).message}`;
      logger.error({
        event: 'chat.send.failed',
        context: {
          personaId: persona.personaId,
          threadId: effect.threadId,
          message: (error as Error).message,
        },
      });
    }
    refreshSummaries();
    render();
  }

  /**
   * Executes controller transition effects produced by one input event dispatch.
   */
  async function runEffects(
    effects: Array<{ type: string; threadId?: string; draft?: string }>,
  ): Promise<boolean> {
    for (const effect of effects) {
      if (effect.type === 'quit_requested') {
        screen.destroy();
        return true;
      }
      if (effect.type === 'refresh_requested') {
        refreshSummaries();
      }
      if (effect.type === 'send_blocked_read_only') {
        statusMessage = 'Send blocked: current thread is read-only in v1.';
      }
      if (effect.type === 'send_requested' && effect.threadId && typeof effect.draft === 'string') {
        await handleSendRequested({
          type: 'send_requested',
          threadId: effect.threadId,
          draft: effect.draft,
        });
      }
    }

    return false;
  }

  screen.on('keypress', async (
    ch: string,
    key: blessed.Widgets.Events.IKeyEventArg,
  ): Promise<void> => {
    const normalized = normalizeBlessedKeypress({
      ch,
      key,
    });
    if (state.view === 'inbox') {
      if (normalized.binding === globalConfig.chat.keymap.move_selection_up) {
        selectedInboxIndex = Math.max(0, selectedInboxIndex - 1);
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.move_selection_down) {
        selectedInboxIndex = Math.min(Math.max(0, summaries.length - 1), selectedInboxIndex + 1);
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.open_thread) {
        const selected = summaries[selectedInboxIndex];
        if (selected) {
          const transition = applyChatControllerAction({
            state,
            action: {
              type: 'open_thread',
              threadId: selected.threadId,
              isReadOnly: selected.isReadOnly,
            },
          });
          state = transition.state;
          shouldScrollThreadToBottom = true;
          const shouldExit = await runEffects(transition.effects);
          if (shouldExit) {
            return;
          }
        }
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.new_local_thread) {
        const seed = createLocalChatThreadSeed({
          db,
          personaMailboxIdentity,
        });
        refreshSummaries();
        selectedInboxIndex = summaries.findIndex((item) => item.threadId === seed.threadId);
        const transition = applyChatControllerAction({
          state,
          action: {
            type: 'new_local_thread',
            threadId: seed.threadId,
          },
        });
        state = transition.state;
        shouldScrollThreadToBottom = true;
        const shouldExit = await runEffects(transition.effects);
        if (shouldExit) {
          return;
        }
        render();
        return;
      }
    }

    if (state.view === 'thread') {
      const scrollDelta = resolveThreadScrollDelta({
        binding: normalized.binding,
      });
      if (typeof scrollDelta === 'number') {
        threadBox.scroll(scrollDelta);
        render();
        return;
      }
    }

    const transition = dispatchChatInputEvent({
      state,
      keymap: globalConfig.chat.keymap,
      event: normalized,
    });
    state = transition.state;
    const shouldExit = await runEffects(transition.effects);
    if (shouldExit) {
      return;
    }

    render();
  });

  screen.on('destroy', () => {
    runtimeClosed = true;
    clearInterval(pollTimer);
    db.close();
  });

  refreshSummaries();
  render();
  await new Promise<void>((resolve) => {
    screen.on('destroy', () => {
      resolve();
    });
  });
}

/**
 * Builds one status line that keeps mode context and latest action feedback visible.
 */
export function buildStatusLine(
  args: {
    view: 'inbox' | 'thread';
    displayModeLabel: string;
    footerHint: string;
    statusMessage: string;
    theme: ChatUiTheme;
  },
): string {
  const prefix = wrapWithBlessedTag({
    tags: args.theme.status.prefixTag,
    value: `[${args.view.toUpperCase()}|${args.displayModeLabel}]`,
  });
  const commandParts = parseStatusHintCommands({
    footerHint: args.footerHint,
  }).map((entry) => {
    const key = wrapWithBlessedTag({
      tags: args.theme.status.commandKeyTag,
      value: entry.key,
    });
    const text = wrapWithBlessedTag({
      tags: args.theme.status.commandTextTag,
      value: entry.text,
    });
    return `${key} ${text}`.trim();
  });
  const commandStrip = wrapTrustedMarkupWithBlessedTag({
    tags: args.theme.status.commandBorderTag,
    value: ` ${commandParts.join('   ')} `,
  });
  const divider = wrapWithBlessedTag({
    tags: args.theme.status.dividerTag,
    value: '|',
  });
  const hasStatusMessage = args.statusMessage.trim().length > 0;
  if (!hasStatusMessage) {
    return `${prefix} ${divider} ${commandStrip}`;
  }
  const styledMessage = wrapWithBlessedTag({
    tags: args.theme.status.messageTag,
    value: args.statusMessage,
  });
  return `${prefix} ${divider} ${commandStrip} ${divider} ${styledMessage}`;
}

/**
 * Parses one footer hint string into command entries for themed status-pill rendering.
 */
export function parseStatusHintCommands(
  args: {
    footerHint: string;
  },
): Array<{
  key: string;
  text: string;
}> {
  return args.footerHint
    .split(/\s{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex < 0) {
        return {
          key: chunk,
          text: '',
        };
      }
      return {
        key: chunk.slice(0, separatorIndex).trim(),
        text: chunk.slice(separatorIndex + 1).trim(),
      };
    });
}

/**
 * Resolves one thread-view key binding into a scroll delta.
 */
export function resolveThreadScrollDelta(
  args: {
    binding: string;
  },
): number | undefined {
  if (args.binding === 'up') {
    return -1;
  }
  if (args.binding === 'down') {
    return 1;
  }
  if (args.binding === 'pageup' || args.binding === 'ctrl+u') {
    return -8;
  }
  if (args.binding === 'pagedown' || args.binding === 'ctrl+d') {
    return 8;
  }

  return undefined;
}

/**
 * Scrolls one thread box to its latest content position.
 */
export function scrollThreadBoxToBottom(
  args: {
    threadBox: {
      setScrollPerc: (percent: number) => void;
    };
  },
): void {
  args.threadBox.setScrollPerc(100);
}

/**
 * Adds one-space horizontal padding to each rendered line for chat readability.
 */
export function applyHorizontalPadding(
  args: {
    content: string;
  },
): string {
  return args.content
    .split('\n')
    .map((line) => ` ${line} `)
    .join('\n');
}

/**
 * Formats one inbox thread row as a multi-line list block with title/timestamp, participants, preview, and separator.
 */
export function formatInboxListRow(
  args: {
    title: string;
    timestamp: string;
    participants: string;
    preview: string;
    isReadOnly: boolean;
    theme: ChatUiTheme;
  },
): string {
  const mode = args.isReadOnly ? 'RO' : 'RW';
  const styledTitle = wrapWithBlessedTag({
    tags: args.theme.inbox.titleTag,
    value: args.title,
  });
  const styledTimestamp = wrapWithBlessedTag({
    tags: args.theme.inbox.timestampTag,
    value: args.timestamp,
  });
  const styledMode = wrapWithBlessedTag({
    tags: args.isReadOnly
      ? args.theme.inbox.readOnlyModeTag
      : args.theme.inbox.writableModeTag,
    value: mode,
  });
  const styledParticipants = wrapWithBlessedTag({
    tags: args.theme.inbox.participantsTag,
    value: args.participants,
  });
  const styledPreview = wrapWithBlessedTag({
    tags: args.theme.inbox.previewTag,
    value: args.preview,
  });
  return [
    `[${styledMode}] ${styledTitle} - ${styledTimestamp}`,
    `Participants: ${styledParticipants}`,
    `${styledPreview}`,
  ].join('\n');
}

/**
 * Escapes blessed tag delimiters from user/content strings before rendering in tag-enabled widgets.
 */
export function escapeBlessedTags(
  args: {
    value: string;
  },
): string {
  return args.value
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

/**
 * Wraps one value in one blessed tag token while escaping embedded tag delimiters.
 */
export function wrapWithBlessedTag(
  args: {
    tags: string[];
    value: string;
  },
): string {
  const escapedValue = escapeBlessedTags({
    value: args.value,
  });
  if (args.tags.length === 0) {
    return escapedValue;
  }

  const openTags = args.tags.map((tag) => `{${tag}}`).join('');
  const closeTags = [...args.tags].reverse().map((tag) => `{/${tag}}`).join('');
  return `${openTags}${escapedValue}${closeTags}`;
}

/**
 * Wraps pre-tagged blessed markup with additional tags without escaping nested tokens.
 */
export function wrapTrustedMarkupWithBlessedTag(
  args: {
    tags: string[];
    value: string;
  },
): string {
  if (args.tags.length === 0) {
    return args.value;
  }
  const openTags = args.tags.map((tag) => `{${tag}}`).join('');
  const closeTags = [...args.tags].reverse().map((tag) => `{/${tag}}`).join('');
  return `${openTags}${args.value}${closeTags}`;
}

/**
 * Renders inbox rows as one multiline string and highlights one selected 4-line block.
 */
export function renderInboxRows(
  args: {
    rows: Array<{
      title: string;
      timestamp: string;
      participants: string;
      preview: string;
      isReadOnly: boolean;
    }>;
    selectedIndex: number;
    theme: ChatUiTheme;
  },
): string {
  const rowGap = '\n'.repeat(args.theme.inbox.rowGapLines + 1);
  return args.rows
    .map((row, index) => {
      const block = formatInboxListRow({
        title: row.title,
        timestamp: row.timestamp,
        participants: row.participants,
        preview: row.preview,
        isReadOnly: row.isReadOnly,
        theme: args.theme,
      });
      const markerTag = index === args.selectedIndex
        ? args.theme.inbox.selectedMarkerTag
        : args.theme.inbox.unselectedMarkerTag;
      const marker = wrapWithBlessedTag({
        tags: markerTag,
        value: args.theme.inbox.markerGlyph,
      });
      return block
        .split('\n')
        .map((line) => ` ${marker} ${line}`)
        .join('\n');
    })
    .join(rowGap);
}

/**
 * Computes next inbox top-row index so selection remains visible without jumpy pinning.
 */
export function computeNextInboxTopRowIndex(
  args: {
    currentTopRowIndex: number;
    selectedIndex: number;
    visibleRowCount: number;
  },
): number {
  if (args.selectedIndex < args.currentTopRowIndex) {
    return args.selectedIndex;
  }

  const currentBottomRowIndex = args.currentTopRowIndex + args.visibleRowCount - 1;
  if (args.selectedIndex > currentBottomRowIndex) {
    return Math.max(0, args.selectedIndex - args.visibleRowCount + 1);
  }

  return args.currentTopRowIndex;
}

/**
 * Computes visible inbox row capacity from current widget height and row block height.
 */
export function readVisibleInboxRowCount(
  args: {
    rowHeightLines: number;
    inboxList: {
      height: number;
    };
  },
): number {
  const viewportLines = Number.isFinite(args.inboxList.height)
    ? Math.max(1, args.inboxList.height - 2)
    : Math.max(1, args.rowHeightLines);
  return Math.max(1, Math.floor(viewportLines / args.rowHeightLines));
}

/**
 * Resolves one persona by id, id prefix, or email local-part selector.
 */
export function resolvePersonaBySelector(
  args: {
    selector: string;
  },
): ReturnType<typeof listPersonas>[number] {
  return resolvePersonaBySelectorShared({
    selector: args.selector,
    personas: listPersonas(),
    ambiguousSelectorMessage: (
      selectorArgs: {
        selector: string;
      },
    ): string => `Ambiguous persona selector "${selectorArgs.selector}". Use a longer persona id prefix.`,
    personaNotFoundMessage: (
      selectorArgs: {
        selector: string;
      },
    ): string => `Persona not found for selector "${selectorArgs.selector}".`,
  });
}

/**
 * Creates runtime action invoker that stores local chat outbound replies in temporal memory.
 */
export function createChatRuntimeActionInvoker(
  args: {
    db: ReturnType<typeof initializeDatabase>;
    message: InboundNormalizedMessage;
    logger: GatewayLogger;
    personaMailboxIdentity: string;
  },
): HarnessRuntimeActionInvoker {
  const delegatedRuntimeInvoker = createGatewayRuntimeActionInvoker({
    message: args.message,
    logger: args.logger,
  });

  return async (
    runtimeArgs: {
      action: string;
      payload: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> => {
    if (runtimeArgs.action !== 'email.send') {
      return delegatedRuntimeInvoker(runtimeArgs);
    }

    const to = Array.isArray(runtimeArgs.payload.to)
      ? runtimeArgs.payload.to.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : ['user@localhost'];
    const subject = typeof runtimeArgs.payload.subject === 'string' && runtimeArgs.payload.subject.trim()
      ? runtimeArgs.payload.subject
      : args.message.subject;
    const text = typeof runtimeArgs.payload.text === 'string' ? runtimeArgs.payload.text : '';
    if (!text.trim()) {
      throw new Error('email.send requires non-empty payload.text.');
    }

    const outboundMessageId = `<chat.outbound.${randomUUID()}@localhost>`;
    storeOutboundMessage({
      db: args.db,
      request: {
        threadId: args.message.threadId,
        messageId: outboundMessageId,
        inReplyTo: args.message.messageId,
        sender: args.personaMailboxIdentity,
        recipients: to,
        subject,
        text,
        receivedAt: new Date().toISOString(),
        metadata: {
          chat_local_delivery: true,
        },
      },
    });
    args.logger.info({
      event: 'chat.runtime_action.completed',
      context: {
        action: runtimeArgs.action,
        threadId: args.message.threadId,
        messageId: outboundMessageId,
      },
    });
    return {
      messageId: outboundMessageId,
    };
  };
}
