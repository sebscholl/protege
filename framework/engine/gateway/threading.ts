import { createHash, randomUUID } from 'node:crypto';

/**
 * Normalizes one message-id style value for deterministic comparisons.
 */
export function normalizeMessageId(
  args: {
    value: string;
  },
): string {
  const trimmed = args.value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed;
  }

  return `<${trimmed.replace(/^<|>$/g, '')}>`;
}

/**
 * Generates one synthetic message id for inputs that do not provide one.
 */
export function generateSyntheticMessageId(): string {
  return `<synthetic.${randomUUID()}@protege.local>`;
}

/**
 * Returns a canonical message id, preferring actual input and falling back to synthetic.
 */
export function ensureMessageId(
  args: {
    value?: string | null;
  },
): string {
  if (!args.value || args.value.trim().length === 0) {
    return generateSyntheticMessageId();
  }

  return normalizeMessageId({ value: args.value });
}

/**
 * Returns normalized references from mixed header formats.
 */
export function normalizeReferences(
  args: {
    references: string[];
  },
): string[] {
  return args.references
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => normalizeMessageId({ value: item }));
}

/**
 * Derives deterministic thread id from references, in-reply-to, or message id.
 */
export function deriveThreadId(
  args: {
    references: string[];
    inReplyTo?: string | null;
    messageId: string;
  },
): string {
  const normalizedReferences = normalizeReferences({ references: args.references });
  const normalizedInReplyTo = args.inReplyTo
    ? normalizeMessageId({ value: args.inReplyTo })
    : undefined;
  const normalizedMessageId = normalizeMessageId({ value: args.messageId });
  const anchor = normalizedReferences.length > 0
    ? normalizedReferences[0]
    : normalizedInReplyTo ?? normalizedMessageId;

  return createHash('sha256').update(anchor).digest('hex');
}

/**
 * Constructs outbound references chain by appending one parent id.
 */
export function buildReplyReferences(
  args: {
    inboundReferences: string[];
    parentMessageId: string;
  },
): string[] {
  const baseReferences = normalizeReferences({ references: args.inboundReferences });
  const parent = normalizeMessageId({ value: args.parentMessageId });
  return [...baseReferences, parent];
}

/**
 * Normalizes reply subject by ensuring an Re prefix is present.
 */
export function buildReplySubject(
  args: {
    subject: string;
  },
): string {
  const trimmed = args.subject.trim();
  if (trimmed.toLowerCase().startsWith('re:')) {
    return trimmed;
  }

  if (trimmed.length === 0) {
    return 'Re:';
  }

  return `Re: ${trimmed}`;
}
