import type { ChatSessionState } from '@engine/chat/controller';
import type { ChatThreadDetail, ChatThreadSummary } from '@engine/chat/queries';
import type { ChatKeymap } from '@engine/shared/runtime-config';

/**
 * Represents one rendered inbox-row model for TUI list widgets.
 */
export type ChatInboxRowModel = {
  threadId: string;
  title: string;
  timestamp: string;
  participants: string;
  preview: string;
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
  attachmentPaths: string[];
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
    keymap: ChatKeymap;
  },
): ChatInboxViewModel {
  return {
    title: '🥚 Protege Chat Inbox',
    modeLabel: args.state.displayMode.toUpperCase(),
    rows: args.summaries.map((summary) => ({
      threadId: summary.threadId,
      title: summary.subject,
      timestamp: formatIsoTimestampCompact({
        value: summary.lastReceivedAt,
      }),
      participants: formatInboxParticipants({
        lastSender: summary.lastSender,
        summary,
      }),
      preview: truncatePreviewText({
        value: summary.preview,
        maxLength: 120,
      }),
      isReadOnly: summary.isReadOnly,
      isSelected: summary.threadId === args.state.selectedThreadId,
    })),
    footerHint: [
      `${formatBindingLabel({ binding: args.keymap.open_thread })}=open thread`,
      `${formatBindingLabel({ binding: args.keymap.new_local_thread })}=new local thread`,
      `${formatBindingLabel({ binding: args.keymap.toggle_display_mode })}=toggle mode`,
      `${formatBindingLabel({ binding: args.keymap.quit })}=quit`,
    ].join('  '),
  };
}

/**
 * Formats one inbox participants label with persona context when available.
 */
export function formatInboxParticipants(
  args: {
    lastSender: string;
    summary: ChatThreadSummary;
  },
): string {
  const personaId = (args.summary as Record<string, unknown>).personaId;
  if (typeof personaId !== 'string' || personaId.length === 0) {
    return args.lastSender;
  }

  return `${personaId} · ${args.lastSender}`;
}

/**
 * Builds one thread view model with explicit read-only/writable banner semantics.
 */
export function buildThreadViewModel(
  args: {
    state: ChatSessionState;
    detail: ChatThreadDetail;
    keymap: ChatKeymap;
  },
): ChatThreadViewModel {
  const composeEnabled = !args.detail.isReadOnly;
  return {
    title: args.detail.subject || 'Untitled Thread',
    modeLabel: args.state.displayMode.toUpperCase(),
    writeBanner: args.detail.isReadOnly
      ? '🥚 READ-ONLY THREAD (v1)'
      : '',
    composeEnabled,
    messages: args.detail.messages.map((message) => buildThreadMessageModel({
      message,
      displayMode: args.state.displayMode,
    })),
    draft: composeEnabled ? args.state.draft : '',
    footerHint: composeEnabled
      ? [
        `${formatBindingLabel({ binding: args.keymap.back_to_inbox })}=back to inbox`,
        `${formatBindingLabel({ binding: args.keymap.enter_compose_mode })}=compose mode`,
        `${formatBindingLabel({ binding: args.keymap.send })}=send`,
        `${formatBindingLabel({ binding: args.keymap.refresh })}=refresh`,
      ].join('  ')
      : [
        `${formatBindingLabel({ binding: args.keymap.back_to_inbox })}=back to inbox`,
        `${formatBindingLabel({ binding: args.keymap.refresh })}=refresh`,
        `${formatBindingLabel({ binding: args.keymap.toggle_display_mode })}=toggle mode`,
        `${formatBindingLabel({ binding: args.keymap.quit })}=quit`,
      ].join('  '),
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
      attachmentPaths: args.message.attachmentPaths,
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
    ].filter(Boolean).join('\n'),
    body: args.message.textBody,
    attachmentPaths: args.message.attachmentPaths,
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

/**
 * Truncates one inbox preview to fixed length for predictable list rendering.
 */
export function truncatePreviewText(
  args: {
    value: string;
    maxLength: number;
  },
): string {
  if (args.value.length <= args.maxLength) {
    return args.value;
  }

  return `${args.value.slice(0, Math.max(0, args.maxLength - 1))}…`;
}

/**
 * Formats key binding labels for compact footer hints.
 */
export function formatBindingLabel(
  args: {
    binding: string;
  },
): string {
  return args.binding
    .split('+')
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join('+');
}
