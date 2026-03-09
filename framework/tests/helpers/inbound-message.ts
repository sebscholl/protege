import type { InboundNormalizedMessage } from '@engine/gateway/types';

/**
 * Represents one simplified address list input for inbound test message factories.
 */
type InboundAddressInput = string[];

/**
 * Builds one normalized inbound message object with deterministic defaults for tests.
 */
export function createInboundMessage(
  args: {
    personaId: string;
    messageId: string;
    threadId: string;
    subject: string;
    text: string;
    from?: InboundAddressInput;
    to?: InboundAddressInput;
    cc?: InboundAddressInput;
    bcc?: InboundAddressInput;
    envelopeRcptTo?: InboundAddressInput;
    references?: string[];
    receivedAt?: string;
    rawMimePath?: string;
    attachments?: InboundNormalizedMessage['attachments'];
    metadata?: InboundNormalizedMessage['metadata'];
  },
): InboundNormalizedMessage {
  return {
    personaId: args.personaId,
    messageId: args.messageId,
    threadId: args.threadId,
    from: (args.from ?? ['sender@example.com']).map((address) => ({ address })),
    to: (args.to ?? ['agent@example.com']).map((address) => ({ address })),
    cc: (args.cc ?? []).map((address) => ({ address })),
    bcc: (args.bcc ?? []).map((address) => ({ address })),
    envelopeRcptTo: (args.envelopeRcptTo ?? args.to ?? ['agent@example.com']).map((address) => ({ address })),
    subject: args.subject,
    text: args.text,
    references: args.references ?? [],
    receivedAt: args.receivedAt ?? '2026-02-14T00:00:00.000Z',
    rawMimePath: args.rawMimePath ?? '/tmp/inbound.eml',
    attachments: args.attachments ?? [],
    metadata: args.metadata,
  };
}
