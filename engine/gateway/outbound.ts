import type { SentMessageInfo, Transporter } from 'nodemailer';

import type {
  GatewayLogger,
  GatewayTransportConfig,
  OutboundReplyRequest,
  RetryPolicy,
} from '@engine/gateway/types';

import { createTransport } from 'nodemailer';

import { buildReplyReferences, normalizeMessageId } from '@engine/gateway/threading';

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
