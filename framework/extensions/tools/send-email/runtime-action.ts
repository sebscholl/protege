import { basename } from 'node:path';

import type { InboundNormalizedMessage, OutboundReplyRequest } from 'protege-toolkit';

import { buildReplySubject, isValidEmailAddress } from 'protege-toolkit';

/**
 * Reads one attachment count from unknown runtime payload value.
 */
export function readAttachmentCountFromRuntimePayload(
  args: {
    value: unknown;
  },
): number {
  return Array.isArray(args.value) ? args.value.length : 0;
}

/**
 * Reads attachment display names from unknown runtime payload value for structured logs.
 */
export function readAttachmentNamesFromRuntimePayload(
  args: {
    value: unknown;
  },
): string[] {
  if (!Array.isArray(args.value) || args.value.length === 0) {
    return [];
  }

  return args.value.map((item) => {
    const record = typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {};
    const filename = record.filename;
    if (typeof filename === 'string' && filename.trim().length > 0) {
      return filename;
    }

    const path = record.path;
    return typeof path === 'string' && path.trim().length > 0
      ? basename(path)
      : 'unknown';
  });
}

/**
 * Infers threading mode by checking whether any outbound recipient is the
 * person who sent the inbound message. If the agent is replying to the
 * sender, the email threads as a reply. If the agent is emailing someone
 * new, it starts a fresh thread.
 */
export function inferThreadingModeFromRecipients(
  args: {
    to: unknown[];
    inboundSenderAddress: string;
  },
): 'reply_current' | 'new_thread' {
  const normalizedSender = args.inboundSenderAddress.trim().toLowerCase();
  const recipientMatchesSender = args.to.some(
    (item) => typeof item === 'string' && item.trim().toLowerCase() === normalizedSender,
  );

  return recipientMatchesSender ? 'reply_current' : 'new_thread';
}

/**
 * Builds one outbound email request from a runtime email.send action payload.
 *
 * Threading is determined in one of two ways:
 *   1. Explicit — the caller passes `threadingMode` in the payload (internal use only).
 *   2. Inferred — when `threadingMode` is absent, the framework checks whether
 *      any `to` recipient matches the inbound sender. If yes → reply_current.
 *      If no → new_thread.
 *
 * The two modes produce different outbound headers:
 *   reply_current — subject becomes "Re: <original>", In-Reply-To and
 *                   References point back to the inbound message.
 *   new_thread    — subject is the caller's value, no In-Reply-To or
 *                   References headers are set.
 */
export function buildEmailSendRequestFromAction(
  args: {
    message: InboundNormalizedMessage;
    personaSenderAddress: string;
    payload: Record<string, unknown>;
    defaultRecursionDepth?: number;
  },
): OutboundReplyRequest {
  const to = readValidatedRecipients({ payload: args.payload });
  const payloadSubject = readValidatedSubject({ payload: args.payload });
  const body = readValidatedBody({ payload: args.payload });

  const threadingMode = args.payload.threadingMode !== undefined
    ? readEmailSendThreadingMode({ value: args.payload.threadingMode })
    : inferThreadingModeFromRecipients({
        to,
        inboundSenderAddress: args.message.from[0]?.address ?? '',
      });

  const { subject, inReplyTo, references } = threadingMode === 'reply_current'
    ? {
        subject: buildReplySubject({ subject: args.message.subject }),
        inReplyTo: args.message.messageId,
        references: args.message.references,
      }
    : {
        subject: payloadSubject,
        inReplyTo: typeof args.payload.inReplyTo === 'string'
          ? args.payload.inReplyTo
          : undefined,
        references: toStringArray({ value: args.payload.references }) ?? [],
      };

  const fromAddress = resolveReplyFromAddress({
    personaSenderAddress: args.personaSenderAddress,
  });
  const recursionHeaderValue = resolveOutboundRecursionHeaderValue({
    message: args.message,
    defaultRecursionDepth: args.defaultRecursionDepth ?? 3,
  });
  const baseHeaders = toStringRecord({ value: args.payload.headers });
  const headers = {
    ...(baseHeaders ?? {}),
    'X-Protege-Recursion': String(recursionHeaderValue),
  };

  return {
    to: to.map((address) => ({ address })),
    from: { address: fromAddress },
    cc: toAddresses({ value: args.payload.cc }),
    bcc: toAddresses({ value: args.payload.bcc }),
    subject,
    text: body,
    html: typeof args.payload.html === 'string' ? args.payload.html : undefined,
    inReplyTo,
    references,
    headers,
    attachments: toOutboundAttachments({ value: args.payload.attachments }),
  };
}

/**
 * Reads and validates the `to` recipients from one email.send payload.
 */
function readValidatedRecipients(
  args: {
    payload: Record<string, unknown>;
  },
): string[] {
  const to = Array.isArray(args.payload.to)
    ? args.payload.to.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    : [];
  if (to.length === 0) {
    throw new Error('email.send requires non-empty payload.to recipients.');
  }
  if (to.some((address) => !isEmailAddress({ value: address }))) {
    throw new Error('email.send requires payload.to recipients to be valid email addresses.');
  }

  return to;
}

/**
 * Reads and validates the `subject` from one email.send payload.
 */
function readValidatedSubject(
  args: {
    payload: Record<string, unknown>;
  },
): string {
  const subject = typeof args.payload.subject === 'string'
    ? args.payload.subject
    : '';
  if (subject.trim().length === 0) {
    throw new Error('email.send requires non-empty payload.subject.');
  }

  return subject;
}

/**
 * Reads and validates the `body` from one email.send payload.
 */
function readValidatedBody(
  args: {
    payload: Record<string, unknown>;
  },
): string {
  const body = typeof args.payload.body === 'string'
    ? args.payload.body
    : typeof args.payload.text === 'string'
      ? args.payload.text
      : '';
  if (body.trim().length === 0) {
    throw new Error('email.send requires non-empty payload.body.');
  }

  return body;
}

/**
 * Resolves outbound recursion header value by decrementing inbound thread budget when present.
 */
export function resolveOutboundRecursionHeaderValue(
  args: {
    message: InboundNormalizedMessage;
    defaultRecursionDepth: number;
  },
): number {
  const inboundRemaining = readInboundRecursionRemaining({
    message: args.message,
  });
  if (inboundRemaining === undefined) {
    return args.defaultRecursionDepth;
  }

  return Math.max(0, inboundRemaining);
}

/**
 * Reads optional recursion remaining value from inbound message metadata.
 */
export function readInboundRecursionRemaining(
  args: {
    message: InboundNormalizedMessage;
  },
): number | undefined {
  const metadata = args.message.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>).recursion_remaining;
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  return undefined;
}

/**
 * Reads email.send threading mode and defaults to reply_current behavior for deterministic threading.
 */
export function readEmailSendThreadingMode(
  args: {
    value: unknown;
  },
): 'reply_current' | 'new_thread' {
  if (args.value === undefined) {
    return 'reply_current';
  }
  if (args.value === 'reply_current' || args.value === 'new_thread') {
    return args.value;
  }

  throw new Error('email.send payload.threadingMode must be "reply_current" or "new_thread".');
}

/**
 * Resolves reply sender address using inbound persona destination as canonical identity.
 */
export function resolveReplyFromAddress(
  args: {
    personaSenderAddress: string;
  },
): string {
  if (!isEmailAddress({ value: args.personaSenderAddress })) {
    throw new Error('Unable to resolve persona sender address for email.send runtime action.');
  }

  return args.personaSenderAddress;
}

/**
 * Returns "Re: <original subject>" when `inReplyTo` matches the inbound
 * message id (indicating a threaded reply). Returns the caller's subject
 * for any other value (indicating a new thread or explicit override).
 */
export function resolveReplySubject(
  args: {
    message: InboundNormalizedMessage;
    inReplyTo?: string;
    payloadSubject: string;
  },
): string {
  if (args.inReplyTo === args.message.messageId) {
    return buildReplySubject({ subject: args.message.subject });
  }

  return args.payloadSubject;
}

/**
 * Returns true when one string resembles an email address.
 */
export function isEmailAddress(
  args: {
    value: string;
  },
): boolean {
  return isValidEmailAddress({
    value: args.value,
    allowLocalhost: true,
  });
}

/**
 * Converts unknown payload values into optional string arrays.
 */
export function toStringArray(
  args: {
    value: unknown;
  },
): string[] | undefined {
  if (!Array.isArray(args.value)) {
    return undefined;
  }

  const values = args.value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return values.length > 0 ? values : undefined;
}

/**
 * Converts unknown array payload values to optional mail-address objects.
 */
export function toAddresses(
  args: {
    value: unknown;
  },
): Array<{ address: string }> | undefined {
  const values = toStringArray({
    value: args.value,
  });
  return values?.map((address) => ({ address }));
}

/**
 * Converts unknown payload header objects into optional string records.
 */
export function toStringRecord(
  args: {
    value: unknown;
  },
): Record<string, string> | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      output[key] = value;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

/**
 * Converts unknown payload attachment values into validated outbound attachment descriptors.
 */
export function toOutboundAttachments(
  args: {
    value: unknown;
  },
): Array<{
  path: string;
  filename?: string;
  contentType?: string;
}> | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (!Array.isArray(args.value)) {
    throw new Error('email.send payload.attachments must be an array.');
  }

  const attachments = args.value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`email.send payload.attachments[${index}] must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const path = typeof record.path === 'string'
      ? record.path.trim()
      : '';
    if (path.length === 0) {
      throw new Error(`email.send payload.attachments[${index}].path is required.`);
    }

    const filename = typeof record.filename === 'string' && record.filename.trim().length > 0
      ? record.filename
      : undefined;
    const contentType = typeof record.contentType === 'string' && record.contentType.trim().length > 0
      ? record.contentType
      : undefined;
    return {
      path,
      filename,
      contentType,
    };
  });

  return attachments.length > 0 ? attachments : undefined;
}
