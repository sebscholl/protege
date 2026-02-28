import type { AddressObject, ParsedMail } from 'mailparser';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import type {
  GatewayLogger,
  InboundAttachment,
  InboundMessageHandler,
  InboundNormalizedMessage,
  MailAddress,
} from '@engine/gateway/types';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

import {
  deriveThreadId,
  ensureMessageId,
  normalizeMessageId,
  normalizeReferences,
} from '@engine/gateway/threading';

/**
 * Enumerates stable inbound error reason codes for operational logging.
 */
export type InboundErrorCode =
  | 'stream_read_error'
  | 'parse_error'
  | 'attachment_limit_exceeded'
  | 'attachment_write_failed'
  | 'persona_not_found'
  | 'access_denied'
  | 'storage_path_unresolved';

/**
 * Represents one inbound SMTP runtime configuration.
 */
export type GatewayInboundConfig = {
  host: string;
  port: number;
  dev: boolean;
  logsDirPath?: string;
  attachmentsDirPath?: string;
  requirePersonaRouting?: boolean;
  attachmentLimits?: Partial<AttachmentLimits>;
  resolvePersonaId?: (
    args: {
      session: SMTPServerSession;
    },
  ) => string | undefined;
  resolvePersonaPaths?: (
    args: {
      personaId: string;
    },
  ) => {
    logsDirPath: string;
      attachmentsDirPath: string;
    };
  evaluateSenderAccess?: (
    args: {
      senderAddress: string;
      session: SMTPServerSession;
      personaId?: string;
    },
  ) => {
    allowed: boolean;
    reason: string;
    matchedRule?: string;
  };
  logger: GatewayLogger;
  onMessage: InboundMessageHandler;
};

/**
 * Represents configurable attachment limit thresholds for inbound processing.
 */
export type AttachmentLimits = {
  maxAttachmentBytes: number;
  maxAttachmentsPerMessage: number;
  maxTotalAttachmentBytes: number;
};

/**
 * Represents a typed inbound processing error with a stable reason code.
 */
export class GatewayInboundError extends Error {
  public readonly code: InboundErrorCode;

  public constructor(
    args: {
      code: InboundErrorCode;
      message: string;
      cause?: unknown;
    },
  ) {
    super(args.message);
    this.code = args.code;
    this.cause = args.cause;
  }
}

/**
 * Starts the inbound SMTP server and returns the active server instance.
 */
export function startInboundServer(
  args: {
    config: GatewayInboundConfig;
  },
): Promise<SMTPServer> {
  const server = new SMTPServer({
    authOptional: args.config.dev,
    disabledCommands: args.config.dev ? ['STARTTLS'] : [],
    onData: (
      stream: SMTPServerDataStream,
      session: SMTPServerSession,
      callback: (error?: Error | null) => void,
    ): void => {
      void handleInboundData({
        stream,
        session,
        config: args.config,
      }).then(() => callback(), (error: Error) => {
        const inboundError = asInboundError({ error });
        args.config.logger.error({
          event: 'gateway.error',
          context: {
            reasonCode: inboundError.code,
            message: inboundError.message,
            smtpSessionId: session.id,
          },
        });
        callback(inboundError);
      });
    },
  });

  return new Promise((resolve, reject) => {
    server.listen(args.config.port, args.config.host, () => {
      args.config.logger.info({
        event: 'gateway.inbound.server_started',
        context: {
          host: args.config.host,
          port: args.config.port,
          dev: args.config.dev,
        },
      });
      resolve(server);
    });

    server.on('error', (error: Error) => {
      args.config.logger.error({
        event: 'gateway.error',
        context: {
          message: error.message,
        },
      });
      reject(error);
    });
  });
}

/**
 * Handles one inbound SMTP stream and emits a normalized message.
 */
export async function handleInboundData(
  args: {
    stream: SMTPServerDataStream;
    session: SMTPServerSession;
    config: GatewayInboundConfig;
  },
): Promise<void> {
  const requirePersonaRouting = args.config.requirePersonaRouting === true;
  const personaId = args.config.resolvePersonaId
    ? args.config.resolvePersonaId({ session: args.session })
    : undefined;
  if (requirePersonaRouting && !personaId) {
    await drainInboundStream({ stream: args.stream });
    throw new GatewayInboundError({
      code: 'persona_not_found',
      message: 'Inbound message recipient did not map to a known persona.',
    });
  }

  const personaPaths = personaId && args.config.resolvePersonaPaths
    ? args.config.resolvePersonaPaths({ personaId })
    : undefined;
  const logsDirPath = personaPaths?.logsDirPath ?? args.config.logsDirPath;
  const attachmentsDirPath = personaPaths?.attachmentsDirPath ?? args.config.attachmentsDirPath;
  if (!logsDirPath || !attachmentsDirPath) {
    throw new GatewayInboundError({
      code: 'storage_path_unresolved',
      message: 'Inbound message storage paths could not be resolved.',
    });
  }

  const rawMimeBuffer = await readStreamBuffer({ stream: args.stream });
  const parsedMail = await parseInboundMail({ rawMimeBuffer });
  const senderAddress = readPrimarySenderAddress({
    parsedMail,
  });
  if (args.config.evaluateSenderAccess) {
    const accessEvaluation = args.config.evaluateSenderAccess({
      senderAddress,
      session: args.session,
      personaId,
    });
    if (!accessEvaluation.allowed) {
      throw new GatewayInboundError({
        code: 'access_denied',
        message: [
          'Inbound sender is not allowed by gateway access policy.',
          `sender=${senderAddress}`,
          `reason=${accessEvaluation.reason}`,
          accessEvaluation.matchedRule ? `matchedRule=${accessEvaluation.matchedRule}` : '',
        ].filter((item) => item.length > 0).join(' '),
      });
    }
  }

  const receivedAt = new Date().toISOString();
  const messageId = ensureMessageId({ value: parsedMail.messageId });
  const references = normalizeReferences({ references: toReferenceArray({ references: parsedMail.references }) });
  const threadId = deriveThreadId({
    references,
    inReplyTo: parsedMail.inReplyTo,
    messageId,
  });
  const rawMimePath = persistRawMime({
    logsDirPath,
    messageId,
    content: rawMimeBuffer,
  });
  const attachments = persistAttachments({
    attachmentsDirPath,
    messageId,
    parsedMail,
    limits: resolveAttachmentLimits({ input: args.config.attachmentLimits }),
  });

  args.config.logger.info({
    event: 'gateway.inbound.parsed',
    context: {
      messageId,
      threadId,
      rawMimePath,
      attachmentCount: attachments.length,
      smtpSessionId: args.session.id,
      personaId: personaId ?? null,
    },
  });

  const message: InboundNormalizedMessage = {
    personaId,
    messageId,
    threadId,
    from: mapAddressObject({ value: parsedMail.from }),
    to: mapAddressObject({ value: parsedMail.to }),
    cc: mapAddressObject({ value: parsedMail.cc }),
    bcc: mapAddressObject({ value: parsedMail.bcc }),
    envelopeRcptTo: mapEnvelopeRecipients({ session: args.session }),
    subject: parsedMail.subject ?? '',
    text: parsedMail.text ?? '',
    html: typeof parsedMail.html === 'string' ? parsedMail.html : undefined,
    references,
    receivedAt,
    rawMimePath,
    attachments,
  };

  await args.config.onMessage({ message });
}

/**
 * Reads one normalized sender email address from parsed mail object.
 */
export function readPrimarySenderAddress(
  args: {
    parsedMail: ParsedMail;
  },
): string {
  return args.parsedMail.from?.value?.[0]?.address?.trim().toLowerCase() ?? '';
}

/**
 * Reads one SMTP stream into a complete buffer.
 */
export function readStreamBuffer(
  args: {
    stream: SMTPServerDataStream;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    args.stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    args.stream.once('error', (error) => {
      reject(new GatewayInboundError({
        code: 'stream_read_error',
        message: 'Failed to read inbound SMTP stream.',
        cause: error,
      }));
    });
    args.stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Drains one inbound SMTP stream without persisting data.
 */
export function drainInboundStream(
  args: {
    stream: SMTPServerDataStream;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    args.stream.once('error', (error) => {
      reject(new GatewayInboundError({
        code: 'stream_read_error',
        message: 'Failed to drain inbound SMTP stream.',
        cause: error,
      }));
    });
    args.stream.once('end', () => resolve());
    args.stream.resume();
  });
}

/**
 * Parses one raw MIME payload into a mailparser object with typed error mapping.
 */
export async function parseInboundMail(
  args: {
    rawMimeBuffer: Buffer;
  },
): Promise<ParsedMail> {
  try {
    return await simpleParser(args.rawMimeBuffer);
  } catch (error) {
    throw new GatewayInboundError({
      code: 'parse_error',
      message: 'Failed to parse inbound MIME payload.',
      cause: error,
    });
  }
}

/**
 * Persists one raw MIME payload for later debugging and traceability.
 */
export function persistRawMime(
  args: {
    logsDirPath: string;
    messageId: string;
    content: Buffer;
  },
): string {
  const safeMessageId = sanitizeMessageIdForPath({ messageId: args.messageId });
  const dirPath = join(args.logsDirPath, 'gateway', 'inbound');
  mkdirSync(dirPath, { recursive: true });
  const filePath = join(dirPath, `${safeMessageId}.eml`);
  writeFileSync(filePath, args.content);
  return filePath;
}

/**
 * Persists inbound attachments and returns metadata records.
 */
export function persistAttachments(
  args: {
    attachmentsDirPath: string;
    messageId: string;
    parsedMail: ParsedMail;
    limits: AttachmentLimits;
  },
): InboundAttachment[] {
  const attachmentDirPath = join(
    args.attachmentsDirPath,
    sanitizeMessageIdForPath({ messageId: args.messageId }),
  );
  try {
    mkdirSync(attachmentDirPath, { recursive: true });
  } catch (error) {
    throw new GatewayInboundError({
      code: 'attachment_write_failed',
      message: 'Failed to create attachment directory.',
      cause: error,
    });
  }

  assertAttachmentLimits({
    attachments: args.parsedMail.attachments,
    limits: args.limits,
  });

  return args.parsedMail.attachments.map((attachment, index) => {
    const fallbackName = `attachment-${index + 1}.bin`;
    const sanitizedName = sanitizeFileName({ value: attachment.filename ?? fallbackName });
    const filePath = join(attachmentDirPath, sanitizedName);
    try {
      writeFileSync(filePath, attachment.content);
    } catch (error) {
      throw new GatewayInboundError({
        code: 'attachment_write_failed',
        message: 'Failed to persist inbound attachment content.',
        cause: error,
      });
    }

    return {
      filename: sanitizedName,
      contentType: attachment.contentType,
      size: attachment.size,
      storagePath: filePath,
      contentId: attachment.cid ?? undefined,
      checksum: createHash('sha256').update(attachment.content).digest('hex'),
    };
  });
}

/**
 * Resolves effective attachment limits using defaults when values are absent.
 */
export function resolveAttachmentLimits(
  args: {
    input?: Partial<AttachmentLimits>;
  },
): AttachmentLimits {
  return {
    maxAttachmentBytes: args.input?.maxAttachmentBytes ?? 10 * 1024 * 1024,
    maxAttachmentsPerMessage: args.input?.maxAttachmentsPerMessage ?? 10,
    maxTotalAttachmentBytes: args.input?.maxTotalAttachmentBytes ?? 25 * 1024 * 1024,
  };
}

/**
 * Validates attachment count and size constraints before persisting files.
 */
export function assertAttachmentLimits(
  args: {
    attachments: ParsedMail['attachments'];
    limits: AttachmentLimits;
  },
): void {
  if (args.attachments.length > args.limits.maxAttachmentsPerMessage) {
    throw new GatewayInboundError({
      code: 'attachment_limit_exceeded',
      message: 'Attachment count exceeds configured maxAttachmentsPerMessage.',
    });
  }

  const totalBytes = args.attachments.reduce((sum, attachment) => sum + attachment.size, 0);
  if (totalBytes > args.limits.maxTotalAttachmentBytes) {
    throw new GatewayInboundError({
      code: 'attachment_limit_exceeded',
      message: 'Attachment size exceeds configured maxTotalAttachmentBytes.',
    });
  }

  const oversizedAttachment = args.attachments.find(
    (attachment) => attachment.size > args.limits.maxAttachmentBytes,
  );
  if (oversizedAttachment) {
    throw new GatewayInboundError({
      code: 'attachment_limit_exceeded',
      message: 'Attachment size exceeds configured maxAttachmentBytes.',
    });
  }
}

/**
 * Normalizes unknown thrown values into typed inbound errors.
 */
export function asInboundError(
  args: {
    error: unknown;
  },
): GatewayInboundError {
  if (args.error instanceof GatewayInboundError) {
    return args.error;
  }

  if (args.error instanceof Error) {
    return new GatewayInboundError({
      code: 'parse_error',
      message: args.error.message,
      cause: args.error,
    });
  }

  return new GatewayInboundError({
    code: 'parse_error',
    message: 'Unknown inbound processing failure.',
    cause: args.error,
  });
}

/**
 * Maps parsed address objects into normalized address records.
 */
export function mapAddressObject(
  args: {
    value?: AddressObject | AddressObject[] | null;
  },
): MailAddress[] {
  if (!args.value) {
    return [];
  }

  if (Array.isArray(args.value)) {
    return args.value.flatMap((item) => mapAddressObject({ value: item }));
  }

  return args.value.value
    .filter((item) => Boolean(item.address))
    .map((item) => ({
      address: item.address ?? '',
      name: item.name || undefined,
    }));
}

/**
 * Converts parsed references into a stable string array shape.
 */
export function toReferenceArray(
  args: {
    references?: string | string[] | null;
  },
): string[] {
  if (!args.references) {
    return [];
  }

  if (Array.isArray(args.references)) {
    return args.references;
  }

  return [args.references];
}

/**
 * Maps SMTP session envelope recipients into normalized address records.
 */
export function mapEnvelopeRecipients(
  args: {
    session: SMTPServerSession;
  },
): MailAddress[] {
  return (args.session.envelope?.rcptTo ?? [])
    .filter((item) => Boolean(item.address))
    .map((item) => ({
      address: item.address,
    }));
}

/**
 * Sanitizes message-id values for directory and filename use.
 */
export function sanitizeMessageIdForPath(
  args: {
    messageId: string;
  },
): string {
  return normalizeMessageId({ value: args.messageId }).replace(/[^a-z0-9.-]/g, '_');
}

/**
 * Sanitizes one attachment filename to reduce unsafe path characters.
 */
export function sanitizeFileName(
  args: {
    value: string;
  },
): string {
  return args.value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
