import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { HarnessRuntimeActionInvoker } from '@engine/harness/runtime';
import type { GatewayLogger } from '@engine/gateway/types';

import { randomUUID } from 'node:crypto';

import blessed from 'neo-blessed';

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
  const inboxList = blessed.list({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-1',
    keys: false,
    mouse: false,
    border: 'line',
    style: {
      selected: {
        bg: 'blue',
      },
    },
    tags: false,
  });
  const threadBox = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-6',
    scrollable: true,
    alwaysScroll: true,
    border: 'line',
    tags: false,
  });
  const composeBox = blessed.box({
    top: '100%-6',
    left: 0,
    width: '100%',
    height: 5,
    border: 'line',
    tags: false,
  });
  const statusBar = blessed.box({
    top: '100%-1',
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
  });

  screen.append(inboxList);
  screen.append(threadBox);
  screen.append(composeBox);
  screen.append(statusBar);

  let selectedInboxIndex = 0;
  let statusMessage = '';
  let lastBinding = '';
  let lastRawKey = '';
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
      inboxList.setItems(inboxViewModel.rows.map((row) => {
        const mode = row.isReadOnly ? '[RO]' : '[RW]';
        return `${mode} ${row.title} :: ${row.subtitle}`;
      }));
      inboxList.select(selectedInboxIndex);
      statusBar.setContent(
        buildStatusLine({
          view: 'inbox',
          mode: state.mode,
          displayModeLabel: inboxViewModel.modeLabel,
          footerHint: inboxViewModel.footerHint,
          statusMessage,
          lastBinding,
          lastRawKey,
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
    threadBox.setContent([
      `${threadViewModel.title} (${threadViewModel.modeLabel} | ${state.mode.toUpperCase()})`,
      '',
      threadViewModel.writeBanner,
      '',
      ...threadViewModel.messages.flatMap((message) => [message.header, message.body, '']),
    ].join('\n'));
    composeBox.setContent(threadViewModel.composeEnabled ? threadViewModel.draft : '[read-only]');
    statusBar.setContent(
      buildStatusLine({
        view: state.view,
        mode: state.mode,
        displayModeLabel: threadViewModel.modeLabel,
        footerHint: threadViewModel.footerHint,
        statusMessage,
        lastBinding,
        lastRawKey,
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
    lastBinding = normalized.binding || '(none)';
    lastRawKey = `name=${key.name ?? ''} full=${key.full ?? ''} ctrl=${key.ctrl ? '1' : '0'} meta=${key.meta ? '1' : '0'} seq=${JSON.stringify(key.sequence ?? '')}`;
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
    mode: 'command' | 'compose';
    displayModeLabel: string;
    footerHint: string;
    statusMessage: string;
    lastBinding: string;
    lastRawKey: string;
  },
): string {
  const prefix = `[${args.view.toUpperCase()}|${args.mode.toUpperCase()}|${args.displayModeLabel}]`;
  const message = args.statusMessage.trim().length > 0 ? args.statusMessage : args.footerHint;
  const keyInfo = ` key=${args.lastBinding.trim().length > 0 ? args.lastBinding : '<none>'}`;
  const rawInfo = args.lastRawKey.trim().length > 0 ? ` raw(${args.lastRawKey})` : '';
  return `${prefix}${keyInfo}${rawInfo} | ${message}`;
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
  return async (
    runtimeArgs: {
      action: string;
      payload: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> => {
    if (runtimeArgs.action !== 'email.send') {
      throw new Error(`Unsupported runtime action: ${runtimeArgs.action}`);
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
