import type { ChatSessionState } from '@engine/chat/controller';
import type { ChatThreadDetail, ChatThreadSummary } from '@engine/chat/queries';

/**
 * Represents one rendered inbox-row model for TUI list widgets.
 */
export type ChatInboxRowModel = {
  threadId: string;
  title: string;
  subtitle: string;
  isReadOnly: boolean;
  isSelected: boolean;
};

/**
 * Represents one rendered inbox view model for TUI widgets.
 */
export type ChatInboxViewModel = {
  title: string;
  modeLabel: string;
  rows: ChatInboxRowModel[];
  footerHint: string;
};

/**
 * Represents one rendered thread message model for TUI widgets.
 */
export type ChatThreadMessageModel = {
  header: string;
  body: string;
};

/**
 * Represents one rendered thread view model for TUI widgets.
 */
export type ChatThreadViewModel = {
  title: string;
  modeLabel: string;
  writeBanner: string;
  composeEnabled: boolean;
  messages: ChatThreadMessageModel[];
  draft: string;
  footerHint: string;
};

/**
 * Builds one inbox list view model from thread summaries and chat session state.
 */
export function buildInboxViewModel(
  args: {
    state: ChatSessionState;
    summaries: ChatThreadSummary[];
  },
): ChatInboxViewModel {
  return {
    title: 'Protege Chat Inbox',
    modeLabel: args.state.displayMode.toUpperCase(),
    rows: args.summaries.map((summary) => ({
      threadId: summary.threadId,
      title: summary.subject,
      subtitle: `${summary.lastSender} · ${summary.preview}`,
      isReadOnly: summary.isReadOnly,
      isSelected: summary.threadId === args.state.selectedThreadId,
    })),
    footerHint: 'Enter=open thread  Ctrl+N=new local thread  Ctrl+V=toggle mode  Ctrl+Q=quit',
  };
}

/**
 * Builds one thread view model with explicit read-only/writable banner semantics.
 */
export function buildThreadViewModel(
  args: {
    state: ChatSessionState;
    detail: ChatThreadDetail;
  },
): ChatThreadViewModel {
  const composeEnabled = !args.detail.isReadOnly;
  return {
    title: args.detail.subject || 'Untitled Thread',
    modeLabel: args.state.displayMode.toUpperCase(),
    writeBanner: args.detail.isReadOnly
      ? 'READ-ONLY THREAD (v1)'
      : 'WRITABLE LOCAL CHAT THREAD',
    composeEnabled,
    messages: args.detail.messages.map((message) => buildThreadMessageModel({
      message,
      displayMode: args.state.displayMode,
    })),
    draft: composeEnabled ? args.state.draft : '',
    footerHint: composeEnabled
      ? 'Esc=command mode  i=compose mode  Ctrl+S=send  Ctrl+R=refresh'
      : 'Esc=back to inbox  Ctrl+R=refresh  Ctrl+V=toggle mode  Ctrl+Q=quit',
  };
}

/**
 * Builds one per-message model variant based on active display mode.
 */
export function buildThreadMessageModel(
  args: {
    message: ChatThreadDetail['messages'][number];
    displayMode: ChatSessionState['displayMode'];
  },
): ChatThreadMessageModel {
  if (args.displayMode === 'light') {
    return {
      header: `${args.message.sender} · ${formatIsoTimestampCompact({ value: args.message.receivedAt })}`,
      body: args.message.textBody,
    };
  }

  return {
    header: [
      `From: ${args.message.sender}`,
      `To: ${args.message.recipients.join(', ')}`,
      `Subject: ${args.message.subject}`,
      `Date: ${args.message.receivedAt}`,
      `Message-ID: ${args.message.messageId}`,
      args.message.inReplyTo ? `In-Reply-To: ${args.message.inReplyTo}` : '',
    ].filter(Boolean).join(' | '),
    body: args.message.textBody,
  };
}

/**
 * Formats one ISO timestamp into compact operator-friendly text.
 */
export function formatIsoTimestampCompact(
  args: {
    value: string;
  },
): string {
  if (!args.value) {
    return '';
  }

  const date = new Date(args.value);
  if (Number.isNaN(date.getTime())) {
    return args.value;
  }

  return date.toISOString().replace('T', ' ').slice(0, 16);
}
