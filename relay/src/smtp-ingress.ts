import { randomUUID } from 'node:crypto';

import type { RelaySessionRegistry } from '@relay/src/session-registry';
import { readRelaySessionByPublicKey } from '@relay/src/session-registry';
import {
  createRelaySmtpChunkFrame,
  createRelaySmtpEndFrame,
  createRelaySmtpStartFrame,
} from '@relay/src/tunnel';

/**
 * Represents one SMTP ingress routing result.
 */
export type RelaySmtpIngressResult = {
  accepted: boolean;
  streamId?: string;
  reason?: 'recipient_invalid' | 'recipient_not_connected' | 'stream_write_failed';
  recipientPublicKeyBase32?: string;
};

/**
 * Resolves one recipient public-key identity local-part from one email address.
 */
export function resolveRelayRecipientPublicKeyBase32(
  args: {
    recipientAddress: string;
  },
): string | undefined {
  const atIndex = args.recipientAddress.indexOf('@');
  if (atIndex <= 0) {
    return undefined;
  }

  return args.recipientAddress.slice(0, atIndex).trim().toLowerCase();
}

/**
 * Routes one inbound SMTP message stream into one authenticated websocket session.
 */
export function routeInboundSmtpToRelaySession(
  args: {
    registry: RelaySessionRegistry;
    recipientAddress: string;
    mailFrom: string;
    chunkBuffers: Buffer[];
    streamId?: string;
  },
): RelaySmtpIngressResult {
  const recipientPublicKeyBase32 = resolveRelayRecipientPublicKeyBase32({
    recipientAddress: args.recipientAddress,
  });
  if (!recipientPublicKeyBase32) {
    return {
      accepted: false,
      reason: 'recipient_invalid',
    };
  }

  const session = readRelaySessionByPublicKey({
    registry: args.registry,
    publicKeyBase32: recipientPublicKeyBase32,
  });
  if (!session) {
    return {
      accepted: false,
      reason: 'recipient_not_connected',
      recipientPublicKeyBase32,
    };
  }

  const streamId = args.streamId ?? randomUUID();
  try {
    session.socket.send(createRelaySmtpStartFrame({
      streamId,
      mailFrom: args.mailFrom,
      rcptTo: args.recipientAddress,
    }));
    for (const chunkBuffer of args.chunkBuffers) {
      session.socket.send(createRelaySmtpChunkFrame({
        streamId,
        chunk: chunkBuffer,
      }));
    }
    session.socket.send(createRelaySmtpEndFrame({
      streamId,
    }));
  } catch {
    return {
      accepted: false,
      streamId,
      reason: 'stream_write_failed',
      recipientPublicKeyBase32,
    };
  }

  return {
    accepted: true,
    streamId,
    recipientPublicKeyBase32,
  };
}
