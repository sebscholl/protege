import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { HarnessRuntimeActionInvoker } from '@engine/harness/runtime';
import type { GatewayLogger } from '@engine/gateway/types';
import type { ChatUiTheme } from '@engine/shared/runtime-config';
import type { HookEventPayloadByName } from '@engine/harness/hooks/events';

import { randomUUID } from 'node:crypto';

import blessed from 'neo-blessed';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { applyComposeInputBinding, createComposeInputState, renderComposeInput } from '@engine/chat/compose-input';
import { dispatchChatInputEvent, applyChatControllerAction, createInitialChatSessionState } from '@engine/chat/controller';
import { normalizeBlessedKeypress } from '@engine/chat/keys';
import { listChatThreadSummaries, readChatThreadDetail } from '@engine/chat/queries';
import { buildInboxViewModel, buildThreadViewModel } from '@engine/chat/view-model';
import { createLocalChatThreadSeed, storeLocalChatUserMessage } from '@engine/chat/writes';
import { isHookEventName } from '@engine/harness/hooks/events';
import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
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
  personaSelector?: string;
  threadId?: string;
};

/**
 * Represents one persona-scoped chat runtime context.
 */
type ChatPersonaContext = {
  personaId: string;
  emailAddress: string;
  displayName?: string;
  localMailboxIdentity: string;
  db: ReturnType<typeof initializeDatabase>;
};

/**
 * Represents one persona-scoped inbox summary item with a stable UI key.
 */
type ChatRuntimeSummary = ReturnType<typeof listChatThreadSummaries>[number] & {
  threadKey: string;
  personaId: string;
  personaDisplayName?: string;
  localMailboxIdentity: string;
};

/**
 * Represents one persona-scoped thread resolution payload.
 */
type ChatRuntimeThreadSelection = {
  threadId: string;
  personaId: string;
  localMailboxIdentity: string;
};

/**
 * Starts one interactive chat TUI session for the selected persona.
 */
export async function startChatRuntime(
  args: StartChatRuntimeOptions,
): Promise<void> {
  const globalConfig = readGlobalRuntimeConfig();
  const allPersonas = listPersonas();
  const filteredPersonas = args.personaSelector
    ? [resolvePersonaBySelector({
      selector: args.personaSelector,
    })]
    : allPersonas;
  if (filteredPersonas.length === 0) {
    throw new Error('No personas available. Create one with `protege persona create`.');
  }
  let selectedNewThreadPersonaIndex = 0;
  let isNewThreadPersonaPickerVisible = false;
  const personaContexts = filteredPersonas.map((persona) => ({
    personaId: persona.personaId,
    emailAddress: persona.emailAddress,
    displayName: persona.displayName,
    localMailboxIdentity: `${persona.emailLocalPart}@localhost`,
    db: initializeDatabase({
      databasePath: resolvePersonaMemoryPaths({
        personaId: persona.personaId,
      }).temporalDbPath,
      migrationsDirPath: resolveMigrationsDirPath(),
    }),
  }));
  const defaultPersonaContext = personaContexts[0];
  if (!defaultPersonaContext) {
    throw new Error('No personas available. Create one with `protege persona create`.');
  }
  const hooks = await loadHookRegistry().catch((error: Error) => {
    process.stderr.write(`hook.dispatch.load_failed scope=chat message=${error.message}\n`);
    return [];
  });
  const hookDispatcher = createHookDispatcher({
    hooks,
    onHookError: (
      hookName: string,
      event,
      error: Error,
    ): void => {
      process.stderr.write(`hook.dispatch.failed scope=chat hookName=${hookName} event=${event} message=${error.message}\n`);
    },
  });
  const logger = createUnifiedLogger({
    logsDirPath: globalConfig.logsDirPath,
    scope: 'chat',
    consoleLogFormat: globalConfig.consoleLogFormat,
    prettyLogTheme: globalConfig.prettyLogTheme,
    emitToConsole: false,
    onEmit: (
      payload: Record<string, unknown>,
    ): void => {
      if (typeof payload.event !== 'string' || !isHookEventName(payload.event)) {
        return;
      }
      hookDispatcher.dispatch(payload.event, payload as HookEventPayloadByName[typeof payload.event]);
    },
  });
  const screen = blessed.screen({
    smartCSR: true,
    fastCSR: true,
    title: args.personaSelector
      ? `Protege Chat: ${defaultPersonaContext.personaId}`
      : 'Protege Chat',
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
    tags: true,
  });
  const composeBox = blessed.box({
    top: '100%-7',
    left: 1,
    width: '100%-2',
    height: 5,
    border: 'line',
    tags: true,
    keys: false,
    mouse: false,
    scrollable: false,
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
  let composeCursorVisible = true;
  let state = createInitialChatSessionState({
    defaultDisplayMode: globalConfig.chat.defaultDisplayMode,
  });
  let composeInputState = createComposeInputState({
    draft: state.draft,
  });
  let shouldScrollThreadToBottom = false;
  let summaries: ChatRuntimeSummary[] = [];
  let selectedThread: ChatRuntimeThreadSelection | undefined;

  /**
   * Refreshes in-memory thread summaries from persona temporal storage.
   */
  function refreshSummaries(): void {
    summaries = personaContexts
      .flatMap((context) => listChatThreadSummaries({
        db: context.db,
        personaMailboxIdentity: context.localMailboxIdentity,
      }).map((summary) => ({
        ...summary,
        threadKey: `${context.personaId}:${summary.threadId}`,
        personaId: context.personaId,
        personaDisplayName: context.displayName,
        localMailboxIdentity: context.localMailboxIdentity,
      })))
      .sort((left, right) => right.lastReceivedAt.localeCompare(left.lastReceivedAt));
    if (selectedInboxIndex >= summaries.length) {
      selectedInboxIndex = Math.max(0, summaries.length - 1);
    }
  }

  /**
   * Resolves one persona context by persona id.
   */
  function resolvePersonaContextById(
    resolvePersonaContextByIdArgs: {
      personaId: string;
    },
  ): ChatPersonaContext | undefined {
    return personaContexts.find((context) => context.personaId === resolvePersonaContextByIdArgs.personaId);
  }

  /**
   * Resolves one selected thread binding from inbox selection key.
   */
  function resolveSelectedThreadFromState(): ChatRuntimeThreadSelection | undefined {
    const threadKey = state.selectedThreadId;
    if (!threadKey) {
      return undefined;
    }
    const summary = summaries.find((item) => item.threadKey === threadKey);
    if (!summary) {
      return undefined;
    }

    return {
      threadId: summary.threadId,
      personaId: summary.personaId,
      localMailboxIdentity: summary.localMailboxIdentity,
    };
  }

  /**
   * Renders current chat session view state to blessed widgets.
   */
  function render(): void {
    if (isNewThreadPersonaPickerVisible) {
      const personaRows = filteredPersonas.map((personaRow, index) => {
        const marker = index === selectedNewThreadPersonaIndex ? '>' : ' ';
        const label = personaRow.displayName && personaRow.displayName.trim().length > 0 ? ` (${personaRow.displayName})` : '';
        return `${marker} ${personaRow.personaId}${label} - ${personaRow.emailAddress}`;
      });
      inboxList.show();
      threadBox.hide();
      composeBox.hide();
      inboxList.focus();
      inboxList.setContent(personaRows.join('\n'));
      statusBar.setContent(buildStatusLine({
        view: 'inbox',
        displayModeLabel: state.displayMode.toUpperCase(),
        footerHint: `${globalConfig.chat.keymap.open_thread}=create thread for persona  Esc=cancel`,
        statusMessage,
        theme: globalConfig.chatUiTheme,
      }));
      screen.render();
      return;
    }
    if (state.view === 'inbox') {
      composeCursorVisible = true;
      const inboxViewModel = buildInboxViewModel({
        state: {
          ...state,
          selectedThreadId: summaries[selectedInboxIndex]?.threadKey,
        },
        summaries,
        keymap: globalConfig.chat.keymap,
      });
      inboxList.show();
      threadBox.hide();
      composeBox.hide();
      inboxList.focus();
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

    selectedThread = resolveSelectedThreadFromState();
    const threadContext = selectedThread
      ? resolvePersonaContextById({
        personaId: selectedThread.personaId,
      })
      : undefined;
    const detail = selectedThread && threadContext
      ? readChatThreadDetail({
        db: threadContext.db,
        threadId: selectedThread.threadId,
        personaMailboxIdentity: selectedThread.localMailboxIdentity,
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
      keymap: globalConfig.chat.keymap,
    });
    inboxList.hide();
    threadBox.show();
    composeBox.show();
    threadBox.setContent(applyHorizontalPadding({
      content: renderThreadViewContent({
        title: threadViewModel.title,
        modeLabel: threadViewModel.modeLabel,
        interactionMode: state.mode.toUpperCase(),
        writeBanner: threadViewModel.writeBanner,
        messages: threadViewModel.messages,
        theme: globalConfig.chatUiTheme,
      }),
    }));
    if (state.mode !== 'compose' && composeInputState.text !== threadViewModel.draft) {
      composeInputState = createComposeInputState({
        draft: threadViewModel.draft,
      });
    }
    composeBox.setContent(applyHorizontalPadding({
      content: renderComposeInput({
        state: composeInputState,
        isReadOnly: !threadViewModel.composeEnabled,
        cursorVisible: composeCursorVisible,
      }),
    }));
    threadBox.focus();
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
    if (isNewThreadPersonaPickerVisible || (state.view === 'thread' && state.mode === 'compose')) {
      return;
    }

    refreshSummaries();
    render();
  }, globalConfig.chat.pollIntervalMs);
  const cursorBlinkTimer = setInterval(() => {
    if (runtimeClosed) {
      return;
    }
    if (state.view === 'thread' && state.mode === 'compose' && !state.isCurrentThreadReadOnly) {
      composeCursorVisible = !composeCursorVisible;
      render();
      return;
    }
    composeCursorVisible = true;
  }, 500);

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
    const selected = summaries.find((item) => item.threadKey === effect.threadId);
    if (!selected) {
      statusMessage = 'Send failed: selected thread was not found.';
      render();
      return;
    }
    const context = resolvePersonaContextById({
      personaId: selected.personaId,
    });
    if (!context) {
      statusMessage = 'Send failed: selected persona context was not found.';
      render();
      return;
    }
    const stored = storeLocalChatUserMessage({
      db: context.db,
      threadId: selected.threadId,
      personaMailboxIdentity: selected.localMailboxIdentity,
      text: effect.draft,
    });
    shouldScrollThreadToBottom = true;
    render();
    const references = readChatThreadDetail({
      db: context.db,
      threadId: selected.threadId,
      personaMailboxIdentity: selected.localMailboxIdentity,
    }).messages.map((message) => message.messageId);
    const inboundMessage: InboundNormalizedMessage = {
      personaId: selected.personaId,
      messageId: stored.messageId,
      threadId: stored.threadId,
      from: [{ address: 'user@localhost' }],
      to: [{ address: selected.localMailboxIdentity }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: selected.localMailboxIdentity }],
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
        senderAddress: selected.localMailboxIdentity,
        suppressFinalResponsePersistenceWhenActions: ['email.send'],
        invokeRuntimeAction: createChatRuntimeActionInvoker({
          db: context.db,
          message: inboundMessage,
          logger,
          personaMailboxIdentity: selected.localMailboxIdentity,
        }),
        logger,
      });
      statusMessage = 'Sent';
      shouldScrollThreadToBottom = true;
    } catch (error) {
      const errorObject = error instanceof Error
        ? error
        : new Error(String(error));
      statusMessage = `Send failed: ${(error as Error).message}`;
      logger.error({
        event: 'chat.send.failed',
        context: {
          personaId: selected.personaId,
          threadId: effect.threadId,
          errorName: errorObject.name,
          message: errorObject.message,
          errorStackPreview: toChatErrorStackPreview({
            stack: errorObject.stack,
          }),
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

  /**
   * Dispatches one compose-mode send binding from key handlers.
   */
  async function dispatchComposeSend(
    args: {
      binding: string;
    },
  ): Promise<void> {
    if (state.view !== 'thread' || state.mode !== 'compose') {
      return;
    }
    state = {
      ...state,
      draft: composeInputState.text,
    };
    const transition = dispatchChatInputEvent({
      state,
      keymap: globalConfig.chat.keymap,
      event: {
        binding: args.binding,
      },
    });
    state = transition.state;
    composeInputState = createComposeInputState({
      draft: state.draft,
    });
    const shouldExit = await runEffects(transition.effects);
    if (shouldExit) {
      return;
    }
    render();
  }

  /**
   * Opens one selected inbox summary row.
   */
  async function openSelectedInboxThread(): Promise<void> {
    const selected = summaries[selectedInboxIndex];
    if (!selected) {
      render();
      return;
    }
    const transition = applyChatControllerAction({
      state,
      action: {
        type: 'open_thread',
        threadId: selected.threadKey,
        isReadOnly: selected.isReadOnly,
      },
    });
    state = transition.state;
    composeInputState = createComposeInputState({
      draft: state.draft,
    });
    shouldScrollThreadToBottom = true;
    const shouldExit = await runEffects(transition.effects);
    if (shouldExit) {
      return;
    }
    render();
  }

  /**
   * Creates one new local writable chat thread for one persona context.
   */
  async function createNewLocalThreadForPersona(
    createNewLocalThreadForPersonaArgs: {
      personaContext: ChatPersonaContext;
    },
  ): Promise<void> {
    const seed = createLocalChatThreadSeed({
      db: createNewLocalThreadForPersonaArgs.personaContext.db,
      personaMailboxIdentity: createNewLocalThreadForPersonaArgs.personaContext.localMailboxIdentity,
    });
    refreshSummaries();
    const createdThreadKey = `${createNewLocalThreadForPersonaArgs.personaContext.personaId}:${seed.threadId}`;
    selectedInboxIndex = summaries.findIndex((item) => item.threadKey === createdThreadKey);
    if (selectedInboxIndex < 0) {
      selectedInboxIndex = 0;
    }
    const transition = applyChatControllerAction({
      state,
      action: {
        type: 'new_local_thread',
        threadId: createdThreadKey,
      },
    });
    state = transition.state;
    composeInputState = createComposeInputState({
      draft: state.draft,
    });
    shouldScrollThreadToBottom = true;
    const shouldExit = await runEffects(transition.effects);
    if (shouldExit) {
      return;
    }
    render();
  }

  screen.on('keypress', async (
    ch: string,
    key: blessed.Widgets.Events.IKeyEventArg,
  ): Promise<void> => {
    const normalized = normalizeBlessedKeypress({
      ch,
      key,
    });
    if (isNewThreadPersonaPickerVisible) {
      if (normalized.binding === globalConfig.chat.keymap.quit) {
        screen.destroy();
        return;
      }
      if (normalized.binding === 'esc') {
        isNewThreadPersonaPickerVisible = false;
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.move_selection_up) {
        selectedNewThreadPersonaIndex = Math.max(0, selectedNewThreadPersonaIndex - 1);
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.move_selection_down) {
        selectedNewThreadPersonaIndex = Math.min(
          Math.max(0, filteredPersonas.length - 1),
          selectedNewThreadPersonaIndex + 1,
        );
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.open_thread) {
        const targetPersona = filteredPersonas[selectedNewThreadPersonaIndex];
        const targetContext = targetPersona
          ? resolvePersonaContextById({
            personaId: targetPersona.personaId,
          })
          : undefined;
        isNewThreadPersonaPickerVisible = false;
        if (!targetContext) {
          statusMessage = 'Unable to create thread: persona context not found.';
          render();
          return;
        }
        await createNewLocalThreadForPersona({
          personaContext: targetContext,
        });
        return;
      }
      return;
    }
    if (state.view === 'thread' && state.mode === 'compose') {
      const shouldDispatchComposeBinding = normalized.binding === 'esc'
        || normalized.binding === globalConfig.chat.keymap.refresh
        || normalized.binding === globalConfig.chat.keymap.toggle_display_mode
        || normalized.binding === globalConfig.chat.keymap.quit;
      if (shouldDispatchComposeBinding) {
        if (normalized.binding === 'esc') {
          const transition = applyChatControllerAction({
            state,
            action: {
              type: 'back_to_inbox',
            },
          });
          state = transition.state;
          composeInputState = createComposeInputState({
            draft: state.draft,
          });
          const shouldExit = await runEffects(transition.effects);
          if (shouldExit) {
            return;
          }
          render();
          return;
        }
        state = {
          ...state,
          draft: composeInputState.text,
        };
        const transition = dispatchChatInputEvent({
          state,
          keymap: globalConfig.chat.keymap,
          event: normalized,
        });
        state = transition.state;
        composeInputState = createComposeInputState({
          draft: state.draft,
        });
        const shouldExit = await runEffects(transition.effects);
        if (shouldExit) {
          return;
        }
        render();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.send) {
        await dispatchComposeSend({
          binding: normalized.binding,
        });
        return;
      }
      const composeTransition = applyComposeInputBinding({
        state: composeInputState,
        binding: resolveComposeInputBinding({
          keymap: globalConfig.chat.keymap,
          binding: normalized.binding,
        }),
        printableText: normalized.printableText,
      });
      if (composeTransition.handled) {
        composeInputState = composeTransition.state;
        state = {
          ...state,
          draft: composeInputState.text,
        };
        render();
      }
      return;
    }

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
        await openSelectedInboxThread();
        return;
      }
      if (normalized.binding === globalConfig.chat.keymap.new_local_thread) {
        if (personaContexts.length > 1 && !args.personaSelector) {
          isNewThreadPersonaPickerVisible = true;
          selectedNewThreadPersonaIndex = 0;
          render();
          return;
        }
        await createNewLocalThreadForPersona({
          personaContext: defaultPersonaContext,
        });
        return;
      }
    }

    if (state.view === 'thread') {
      const scrollDelta = resolveThreadScrollDelta({
        binding: normalized.binding,
        keymap: globalConfig.chat.keymap,
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
    composeInputState = createComposeInputState({
      draft: state.draft,
    });
    const shouldExit = await runEffects(transition.effects);
    if (shouldExit) {
      return;
    }

    render();
  });

  screen.on('destroy', () => {
    runtimeClosed = true;
    clearInterval(pollTimer);
    clearInterval(cursorBlinkTimer);
    for (const context of personaContexts) {
      context.db.close();
    }
  });

  refreshSummaries();
  if (args.threadId) {
    const thread = summaries.find((item) => item.threadId === args.threadId || item.threadKey === args.threadId);
    if (thread) {
      selectedInboxIndex = summaries.findIndex((item) => item.threadKey === thread.threadKey);
      state = applyChatControllerAction({
        state,
        action: {
          type: 'open_thread',
          threadId: thread.threadKey,
          isReadOnly: thread.isReadOnly,
        },
      }).state;
      composeInputState = createComposeInputState({
        draft: state.draft,
      });
      shouldScrollThreadToBottom = true;
    }
  }
  render();
  await new Promise<void>((resolve) => {
    screen.on('destroy', () => {
      resolve();
    });
  });
}

/**
 * Converts one chat runtime error stack string into a short preview line list.
 */
export function toChatErrorStackPreview(
  args: {
    stack: string | undefined;
  },
): string[] {
  if (!args.stack || args.stack.trim().length === 0) {
    return [];
  }

  return args.stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);
}

/**
 * Renders one thread view content block with themed title, banner, and dot-prefixed message groups.
 */
export function renderThreadViewContent(
  args: {
    title: string;
    modeLabel: string;
    interactionMode: string;
    writeBanner: string;
    messages: Array<{
      header: string;
      body: string;
      attachmentPaths: string[];
    }>;
    theme: ChatUiTheme;
  },
): string {
  const styledTitle = wrapWithBlessedTag({
    tags: args.theme.thread.titleTag,
    value: args.title,
  });
  const styledMode = wrapWithBlessedTag({
    tags: args.theme.thread.modeTag,
    value: `(${args.modeLabel} | ${args.interactionMode})`,
  });
  const styledBanner = wrapWithBlessedTag({
    tags: args.theme.thread.writeBannerTag,
    value: args.writeBanner,
  });
  const styledMessageDot = wrapWithBlessedTag({
    tags: args.theme.thread.messageDotTag,
    value: args.theme.thread.messageDotGlyph,
  });
  const messageBlocks = args.messages.flatMap((message, index) => {
    const headerLines = message.header
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const bodyLines = message.body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const styledHeaderLines = headerLines.map((line) => wrapWithBlessedTag({
      tags: args.theme.thread.messageHeaderTag,
      value: line,
    }));
    const styledBodyLines = bodyLines.map((line) => wrapWithBlessedTag({
      tags: args.theme.thread.messageBodyTag,
      value: line,
    }));
    const styledAttachmentLines = message.attachmentPaths.map((path) => wrapWithBlessedTag({
      tags: args.theme.thread.attachmentTag,
      value: `Attachment: ${path}`,
    }));
    const blockLines: string[] = [];
    if (styledHeaderLines.length > 0) {
      blockLines.push(`${styledMessageDot} ${styledHeaderLines[0]}`);
      blockLines.push(...styledHeaderLines.slice(1).map((line) => `  ${line}`));
    } else {
      blockLines.push(`${styledMessageDot}`);
    }
    blockLines.push('');
    blockLines.push(...styledBodyLines.map((line) => ` ${line}`));
    if (styledAttachmentLines.length > 0) {
      blockLines.push('');
      blockLines.push(...styledAttachmentLines.map((line) => ` ${line}`));
    }
    if (index < args.messages.length - 1) {
      blockLines.push('');
    }

    return blockLines;
  });
  return [
    `${styledTitle} ${styledMode}`,
    '',
    styledBanner,
    '',
    ...messageBlocks,
  ].join('\n');
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
    keymap: {
      scroll_thread_up: string;
      scroll_thread_down: string;
      scroll_thread_page_up: string;
      scroll_thread_page_down: string;
    };
  },
): number | undefined {
  if (args.binding === args.keymap.scroll_thread_up) {
    return -1;
  }
  if (args.binding === args.keymap.scroll_thread_down) {
    return 1;
  }
  if (args.binding === args.keymap.scroll_thread_page_up) {
    return -8;
  }
  if (args.binding === args.keymap.scroll_thread_page_down) {
    return 8;
  }

  return undefined;
}

/**
 * Resolves one normalized key binding to compose input action binding from configured keymap.
 */
export function resolveComposeInputBinding(
  args: {
    keymap: {
      compose_cursor_left: string;
      compose_cursor_right: string;
      compose_cursor_home: string;
      compose_cursor_end: string;
      compose_delete_backward: string;
      compose_delete_forward: string;
    };
    binding: string;
  },
): string {
  if (args.binding === args.keymap.compose_cursor_left) {
    return 'left';
  }
  if (args.binding === args.keymap.compose_cursor_right) {
    return 'right';
  }
  if (args.binding === args.keymap.compose_cursor_home) {
    return 'home';
  }
  if (args.binding === args.keymap.compose_cursor_end) {
    return 'end';
  }
  if (args.binding === args.keymap.compose_delete_backward) {
    return 'backspace';
  }
  if (args.binding === args.keymap.compose_delete_forward) {
    return 'delete';
  }

  return args.binding;
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
