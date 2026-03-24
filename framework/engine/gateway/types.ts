import type { SMTPServerSession } from 'smtp-server';

/**
 * Represents one parsed mailbox address.
 */
export type MailAddress = {
  address: string;
  name?: string;
};

/**
 * Represents persisted attachment metadata for one inbound message.
 */
export type InboundAttachment = {
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  contentId?: string;
  checksum?: string;
};

/**
 * Represents the normalized inbound message contract used by gateway consumers.
 */
export type InboundNormalizedMessage = {
  personaId?: string;
  messageId: string;
  threadId: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  envelopeRcptTo: MailAddress[];
  subject: string;
  text: string;
  html?: string;
  references: string[];
  receivedAt: string;
  rawMimePath: string;
  attachments: InboundAttachment[];
  metadata?: Record<string, unknown>;
};

/**
 * Represents one outbound reply request for SMTP delivery.
 */
export type OutboundReplyRequest = {
  to: MailAddress[];
  from: MailAddress;
  cc?: MailAddress[];
  bcc?: MailAddress[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references: string[];
  headers?: Record<string, string>;
  attachments?: OutboundAttachment[];
};

/**
 * Represents one outbound attachment descriptor for runtime-driven email sends.
 */
export type OutboundAttachment = {
  path: string;
  filename?: string;
  contentType?: string;
};

/**
 * Represents minimal outbound SMTP transport configuration.
 */
export type GatewayTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
};

/**
 * Represents retry behavior for outbound send attempts.
 */
export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
};

/**
 * Represents session envelope recipient details from SMTP runtime.
 */
export type SessionEnvelope = Pick<SMTPServerSession, 'envelope'>;

/**
 * Defines the logging contract used by gateway modules.
 */
export type GatewayLogger = {
  info: (args: { event: string; context: Record<string, unknown> }) => void;
  error: (args: { event: string; context: Record<string, unknown> }) => void;
};

/**
 * Represents one inbound processing callback.
 */
export type InboundMessageHandler = (
  args: {
    message: InboundNormalizedMessage;
  },
) => Promise<void>;
