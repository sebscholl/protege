import type { SentMessageInfo, Transporter } from 'nodemailer';
import type { RelayClientController } from '@engine/gateway/relay-client';

import type {
  GatewayLogger,
  GatewayTransportConfig,
  OutboundReplyRequest,
  RetryPolicy,
} from '@engine/gateway/types';

import { randomUUID } from 'node:crypto';

import { createTransport } from 'nodemailer';

import { buildReplyReferences, normalizeMessageId } from '@engine/gateway/threading';
import {
  createRelaySmtpChunkFrame,
  createRelaySmtpEndFrame,
  createRelaySmtpStartFrame,
} from '@relay/src/tunnel';

/**
 * Creates one nodemailer transport from gateway configuration.
 */
export function createOutboundTransport(
  args: {
    config: GatewayTransportConfig;
  },
): Transporter {
  return createTransport({
    host: args.config.host,
    port: args.config.port,
    secure: args.config.secure,
    auth: args.config.auth,
  });
}

/**
 * Sends one threaded reply with retry behavior.
 */
export async function sendGatewayReply(
  args: {
    transport: Transporter;
    request: OutboundReplyRequest;
    logger: GatewayLogger;
    retryPolicy?: RetryPolicy;
    correlationId?: string;
  },
): Promise<SentMessageInfo> {
  const retryPolicy: RetryPolicy = args.retryPolicy ?? {
    maxAttempts: 3,
    baseDelayMs: 200,
  };

  const parentId = normalizeMessageId({ value: args.request.inReplyTo });
  const references = buildReplyReferences({
    inboundReferences: args.request.references,
    parentMessageId: parentId,
  });

  let attempt = 0;
  while (attempt < retryPolicy.maxAttempts) {
    attempt += 1;
    try {
      args.logger.info({
        event: 'gateway.outbound.sending',
        context: {
          correlationId: args.correlationId ?? null,
          attempt,
          to: args.request.to.map((item) => item.address),
          inReplyTo: parentId,
        },
      });

      const info = await args.transport.sendMail({
        to: args.request.to.map((item) => item.address),
        from: args.request.from.address,
        cc: args.request.cc?.map((item) => item.address),
        bcc: args.request.bcc?.map((item) => item.address),
        subject: args.request.subject,
        text: args.request.text,
        html: args.request.html,
        inReplyTo: parentId,
        references,
        headers: args.request.headers,
      });

      args.logger.info({
        event: 'gateway.outbound.sent',
        context: {
          correlationId: args.correlationId ?? null,
          attempt,
          to: args.request.to.map((item) => item.address),
          inReplyTo: parentId,
        },
      });
      return info;
    } catch (error) {
      const errorObject = error as Error;
      args.logger.error({
        event: 'gateway.error',
        context: {
          correlationId: args.correlationId ?? null,
          attempt,
          message: errorObject.message,
        },
      });

      if (attempt >= retryPolicy.maxAttempts) {
        throw errorObject;
      }

      await delay({
        ms: retryPolicy.baseDelayMs * (2 ** (attempt - 1)),
      });
    }
  }
}

/**
 * Sends one threaded reply through relay websocket tunnel frames with retry behavior.
 */
export async function sendGatewayReplyViaRelay(
  args: {
    relayClient: RelayClientController;
    request: OutboundReplyRequest;
    logger: GatewayLogger;
    retryPolicy?: RetryPolicy;
    correlationId?: string;
  },
): Promise<{
  messageId: string;
}> {
  const retryPolicy: RetryPolicy = args.retryPolicy ?? {
    maxAttempts: 3,
    baseDelayMs: 200,
  };
  const parentId = normalizeMessageId({ value: args.request.inReplyTo });
  const references = buildReplyReferences({
    inboundReferences: args.request.references,
    parentMessageId: parentId,
  });

  let attempt = 0;
  while (attempt < retryPolicy.maxAttempts) {
    attempt += 1;
    try {
      const mime = await renderGatewayReplyMime({
        request: {
          ...args.request,
          inReplyTo: parentId,
          references,
        },
      });
      const envelopeRecipients = deriveEnvelopeRecipients({
        request: args.request,
      });
      for (const recipientAddress of envelopeRecipients) {
        const streamId = randomUUID();
        args.relayClient.sendBinaryFrame({
          frame: createRelaySmtpStartFrame({
            streamId,
            mailFrom: args.request.from.address,
            rcptTo: recipientAddress,
          }),
        });
        for (const chunk of chunkBuffer({
          value: mime.message,
          chunkSizeBytes: 64 * 1024,
        })) {
          args.relayClient.sendBinaryFrame({
            frame: createRelaySmtpChunkFrame({
              streamId,
              chunk,
            }),
          });
        }
        args.relayClient.sendBinaryFrame({
          frame: createRelaySmtpEndFrame({
            streamId,
          }),
        });
      }

      args.logger.info({
        event: 'gateway.outbound.sent_via_relay',
        context: {
          correlationId: args.correlationId ?? null,
          attempt,
          recipients: envelopeRecipients,
          inReplyTo: parentId,
          messageId: mime.messageId,
        },
      });
      return {
        messageId: mime.messageId,
      };
    } catch (error) {
      const errorObject = error as Error;
      args.logger.error({
        event: 'gateway.error',
        context: {
          correlationId: args.correlationId ?? null,
          attempt,
          message: errorObject.message,
        },
      });
      if (attempt >= retryPolicy.maxAttempts) {
        throw errorObject;
      }

      await delay({
        ms: retryPolicy.baseDelayMs * (2 ** (attempt - 1)),
      });
    }
  }

  throw new Error('Relay outbound send exhausted retry loop without completion.');
}

/**
 * Renders one outbound reply request as raw MIME using nodemailer stream transport.
 */
export async function renderGatewayReplyMime(
  args: {
    request: OutboundReplyRequest;
  },
): Promise<{
  message: Buffer;
  messageId: string;
}> {
  const streamTransport = createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  const info = await streamTransport.sendMail({
    to: args.request.to.map((item) => item.address),
    from: args.request.from.address,
    cc: args.request.cc?.map((item) => item.address),
    bcc: args.request.bcc?.map((item) => item.address),
    subject: args.request.subject,
    text: args.request.text,
    html: args.request.html,
    inReplyTo: args.request.inReplyTo,
    references: args.request.references,
    headers: args.request.headers,
  }) as SentMessageInfo;
  return {
    message: info.message as Buffer,
    messageId: info.messageId,
  };
}

/**
 * Derives one deduplicated SMTP envelope recipient list from outbound request recipients.
 */
export function deriveEnvelopeRecipients(
  args: {
    request: OutboundReplyRequest;
  },
): string[] {
  const recipients = [
    ...args.request.to,
    ...(args.request.cc ?? []),
    ...(args.request.bcc ?? []),
  ].map((item) => item.address);
  return Array.from(new Set(recipients));
}

/**
 * Splits one buffer into fixed-size chunk slices for relay frame transmission.
 */
export function chunkBuffer(
  args: {
    value: Buffer;
    chunkSizeBytes: number;
  },
): Buffer[] {
  if (args.chunkSizeBytes <= 0) {
    throw new Error('chunkSizeBytes must be greater than zero.');
  }

  const chunks: Buffer[] = [];
  for (let offset = 0; offset < args.value.length; offset += args.chunkSizeBytes) {
    chunks.push(args.value.subarray(offset, offset + args.chunkSizeBytes));
  }

  return chunks;
}

/**
 * Waits one fixed duration before continuing execution.
 */
export function delay(
  args: {
    ms: number;
  },
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, args.ms);
  });
}
