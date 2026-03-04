type HarnessResolverDefinition = {
  name: string;
  resolve: (
    args: {
      invocation: {
        context: Record<string, unknown>;
      };
    },
  ) => unknown;
};

/**
 * Emits routing and invocation metadata note for deterministic email tool calls.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'invocation-metadata',
  resolve: ({ invocation }): string | null => {
    const input = isRecord(invocation.context.input)
      ? invocation.context.input
      : undefined;
    if (!input) {
      return null;
    }

    return buildInvocationMetadataNote({
      input: {
        messageId: typeof input.messageId === 'string' ? input.messageId : 'unknown',
        metadata: isRecord(input.metadata) ? input.metadata : {},
      },
      threadId: typeof invocation.context.threadId === 'string'
        ? invocation.context.threadId
        : undefined,
    });
  },
};

/**
 * Builds deterministic email-routing context note for resolver-driven context assembly.
 */
function buildInvocationMetadataNote(
  args: {
    input: {
      messageId: string;
      metadata?: Record<string, unknown>;
    };
    threadId?: string;
  },
): string {
  const metadata = args.input.metadata ?? {};
  const from = readStringArrayMetadata({
    value: metadata.from,
  });
  const to = readStringArrayMetadata({
    value: metadata.to,
  });
  const cc = readStringArrayMetadata({
    value: metadata.cc,
  });
  const bcc = readStringArrayMetadata({
    value: metadata.bcc,
  });
  const references = readStringArrayMetadata({
    value: metadata.references,
  });
  const replyToDefault = typeof metadata.replyToDefault === 'string'
    ? metadata.replyToDefault
    : '';
  const replyFromAddress = typeof metadata.replyFromAddress === 'string'
    ? metadata.replyFromAddress
    : '';

  if (
    from.length === 0
    && to.length === 0
    && cc.length === 0
    && bcc.length === 0
    && replyToDefault.length === 0
    && replyFromAddress.length === 0
  ) {
    return '';
  }

  return [
    'Inbound email routing context:',
    `- message_id: ${args.input.messageId}`,
    `- thread_id: ${args.threadId ?? 'unknown'}`,
    `- reply_to_default: ${replyToDefault || 'unknown'}`,
    `- reply_from_address: ${replyFromAddress || 'unknown'}`,
    `- from: ${from.join(', ') || 'none'}`,
    `- to: ${to.join(', ') || 'none'}`,
    `- cc: ${cc.join(', ') || 'none'}`,
    `- bcc: ${bcc.join(', ') || 'none'}`,
    `- references: ${references.join(', ') || 'none'}`,
    'If responding by email, use send_email with concrete email addresses. Do not use labels like \"user\".',
    'For normal replies, send_email.to should usually include reply_to_default.',
    'Threading defaults to replying on the current message. Only set send_email.threadingMode to \"new_thread\" when intentionally starting a separate thread.',
  ].join('\\n');
}

/**
 * Returns true when one unknown value is a plain object.
 */
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads one metadata value as a filtered string-array.
 */
function readStringArrayMetadata(
  args: {
    value: unknown;
  },
): string[] {
  if (!Array.isArray(args.value)) {
    return [];
  }

  return args.value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}
