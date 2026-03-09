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
} from '@engine/shared/relay-tunnel';

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
        attachments: args.request.attachments?.map((attachment) => ({
          path: attachment.path,
          filename: attachment.filename,
          contentType: attachment.contentType,
        })),
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
    deliverySignalTimeoutMs?: number;
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
      const shouldAwaitDeliverySignals = isRelayClientDeliverySignalsEnabled({
        relayClient: args.relayClient,
      });
      const deliveryWaiters: Array<Promise<RelayDeliverySignal>> = [];
      for (const recipientAddress of envelopeRecipients) {
        const streamId = randomUUID();
        if (shouldAwaitDeliverySignals) {
          deliveryWaiters.push(waitForRelayDeliverySignal({
            relayClient: args.relayClient,
            streamId,
            timeoutMs: args.deliverySignalTimeoutMs,
          }));
        }
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
      if (shouldAwaitDeliverySignals) {
        try {
          const signals = await Promise.all(deliveryWaiters);
          const failedSignal = signals.find((signal) => signal.status === 'failed');
          if (failedSignal) {
            throw new Error(failedSignal.errorMessage ?? 'Relay outbound delivery failed.');
          }
        } catch (error) {
          if (!isRelayDeliverySignalTimeoutError({ error })) {
            throw error;
          }
          const timeoutError = error as RelayDeliverySignalTimeoutError;

          args.logger.error({
            event: 'gateway.outbound.relay_delivery_signal_timeout',
            context: {
              correlationId: args.correlationId ?? null,
              attempt,
              message: timeoutError.message,
              recipients: envelopeRecipients,
              inReplyTo: parentId,
              messageId: mime.messageId,
            },
          });
          args.logger.info({
            event: 'gateway.outbound.queued_via_relay',
            context: {
              correlationId: args.correlationId ?? null,
              attempt,
              recipients: envelopeRecipients,
              inReplyTo: parentId,
              messageId: mime.messageId,
              deliverySignalTimedOut: true,
            },
          });
          return {
            messageId: mime.messageId,
          };
        }
      }

      args.logger.info({
        event: shouldAwaitDeliverySignals
          ? 'gateway.outbound.sent_via_relay'
          : 'gateway.outbound.queued_via_relay',
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

type RelayDeliverySignal = {
  streamId: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
};

/**
 * Represents one timeout while waiting for relay delivery control signaling.
 */
export class RelayDeliverySignalTimeoutError extends Error {}

const RELAY_DELIVERY_SIGNAL_TIMEOUT_MS = 20_000;
const relayClientsWithDeliverySignals = new WeakSet<RelayClientController>();
const relayPendingSignalsByClient = new WeakMap<
  RelayClientController,
  Map<string, {
    resolve: (signal: RelayDeliverySignal) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>
>();

/**
 * Marks one relay client as delivery-signal capable for strict send completion semantics.
 */
export function registerRelayClientDeliverySignals(
  args: {
    relayClient: RelayClientController;
  },
): void {
  relayClientsWithDeliverySignals.add(args.relayClient);
}

/**
 * Handles one relay delivery control message and resolves pending send waiters.
 */
export function handleRelayDeliveryControlMessage(
  args: {
    relayClient: RelayClientController;
    payload: Record<string, unknown>;
  },
): void {
  if (args.payload.type !== 'relay_delivery_result') {
    return;
  }

  const streamId = typeof args.payload.streamId === 'string' ? args.payload.streamId : undefined;
  const status = args.payload.status === 'sent' || args.payload.status === 'failed'
    ? args.payload.status
    : undefined;
  if (!streamId || !status) {
    return;
  }

  const waiters = relayPendingSignalsByClient.get(args.relayClient);
  const waiter = waiters?.get(streamId);
  if (!waiter) {
    return;
  }

  clearTimeout(waiter.timeout);
  waiters?.delete(streamId);
  waiter.resolve({
    streamId,
    status,
    errorMessage: typeof args.payload.error === 'string' ? args.payload.error : undefined,
  });
}

/**
 * Returns true when one relay client is configured to provide delivery control signals.
 */
export function isRelayClientDeliverySignalsEnabled(
  args: {
    relayClient: RelayClientController;
  },
): boolean {
  return relayClientsWithDeliverySignals.has(args.relayClient);
}

/**
 * Waits for one relay delivery signal for a specific stream id.
 */
export function waitForRelayDeliverySignal(
  args: {
    relayClient: RelayClientController;
    streamId: string;
    timeoutMs?: number;
  },
): Promise<RelayDeliverySignal> {
  const waiters = relayPendingSignalsByClient.get(args.relayClient) ?? new Map();
  relayPendingSignalsByClient.set(args.relayClient, waiters);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(args.streamId);
      reject(new RelayDeliverySignalTimeoutError(`Timed out waiting for relay delivery signal for stream ${args.streamId}.`));
    }, args.timeoutMs ?? RELAY_DELIVERY_SIGNAL_TIMEOUT_MS);
    waiters.set(args.streamId, {
      resolve,
      reject,
      timeout,
    });
  });
}

/**
 * Returns true when one unknown error is a relay delivery signal timeout.
 */
export function isRelayDeliverySignalTimeoutError(
  args: {
    error: unknown;
  },
): args is {
  error: RelayDeliverySignalTimeoutError;
} {
  return args.error instanceof RelayDeliverySignalTimeoutError;
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
    attachments: args.request.attachments?.map((attachment) => ({
      path: attachment.path,
      filename: attachment.filename,
      contentType: attachment.contentType,
    })),
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
