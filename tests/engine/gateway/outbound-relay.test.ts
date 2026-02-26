import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  chunkBuffer,
  deriveEnvelopeRecipients,
  handleRelayDeliveryControlMessage,
  registerRelayClientDeliverySignals,
  renderGatewayReplyMime,
  sendGatewayReplyViaRelay,
} from '@engine/gateway/outbound';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';

let envelopeRecipientCount = 0;
let renderedMimeContainsSubject = false;
let relayedFrameCount = 0;
let relayedStartType = '';
let relayedChunkType = '';
let relayedEndType = '';
let relayedChunkPayloadHasBody = false;
let relayedMessageIdLength = 0;
let chunkCount = 0;
let invalidChunkSizeThrows = false;
let retrySucceededAfterTransientFailure = false;
let retryAttemptCount = 0;
let strictDeliverySignalSucceeded = false;
let strictDeliverySignalFailureMessage = '';
let relayMimeContainsAttachmentFilename = false;

beforeAll(async (): Promise<void> => {
  envelopeRecipientCount = deriveEnvelopeRecipients({
    request: {
      to: [{ address: 'a@example.com' }],
      cc: [{ address: 'b@example.com' }],
      bcc: [{ address: 'a@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Test Subject',
      text: 'hello world',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
    },
  }).length;

  const rendered = await renderGatewayReplyMime({
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Relay Render Test',
      text: 'relay render body',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
    },
  });
  renderedMimeContainsSubject = rendered.message.toString('utf8').includes('Subject: Relay Render Test');

  const renderedWithAttachment = await renderGatewayReplyMime({
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Relay Render Attachment Test',
      text: 'relay render attachment body',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
      attachments: [
        {
          path: join(process.cwd(), 'tests', 'fixtures', 'email', 'email-plain.eml'),
          filename: 'relay-fixture.eml',
          contentType: 'message/rfc822',
        },
      ],
    },
  });
  relayMimeContainsAttachmentFilename = renderedWithAttachment.message
    .toString('utf8')
    .includes('filename=relay-fixture.eml');

  const sentFrames: Buffer[] = [];
  const result = await sendGatewayReplyViaRelay({
    relayClient: {
      stop: (): void => undefined,
      sendTextMessage: (): void => undefined,
      sendBinaryFrame: (args): void => {
        sentFrames.push(args.frame);
      },
      readStatus: (): { connected: boolean; authenticated: boolean; reconnectAttempt: number } => ({
        connected: true,
        authenticated: true,
        reconnectAttempt: 0,
      }),
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Relay Send Test',
      text: 'relay send body',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
    },
  });
  relayedMessageIdLength = result.messageId.length;
  relayedFrameCount = sentFrames.length;
  relayedStartType = parseRelayTunnelFrame({
    payload: sentFrames[0],
  })?.type ?? '';
  relayedChunkType = parseRelayTunnelFrame({
    payload: sentFrames[1],
  })?.type ?? '';
  relayedEndType = parseRelayTunnelFrame({
    payload: sentFrames[sentFrames.length - 1],
  })?.type ?? '';
  relayedChunkPayloadHasBody = (() : boolean => {
    const parsed = parseRelayTunnelFrame({
      payload: sentFrames[1],
    });
    return parsed?.type === 'smtp_chunk'
      && parsed.chunk.toString('utf8').includes('relay send body');
  })();

  chunkCount = chunkBuffer({
    value: Buffer.from('abcdefghij', 'utf8'),
    chunkSizeBytes: 4,
  }).length;
  try {
    chunkBuffer({
      value: Buffer.from('abc', 'utf8'),
      chunkSizeBytes: 0,
    });
  } catch {
    invalidChunkSizeThrows = true;
  }

  const retryFrames: Buffer[] = [];
  let firstAttempt = true;
  await sendGatewayReplyViaRelay({
    relayClient: {
      stop: (): void => undefined,
      sendTextMessage: (): void => undefined,
      sendBinaryFrame: (args): void => {
        retryAttemptCount += 1;
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error('relay backpressure simulated');
        }

        retryFrames.push(args.frame);
      },
      readStatus: (): { connected: boolean; authenticated: boolean; reconnectAttempt: number } => ({
        connected: true,
        authenticated: true,
        reconnectAttempt: 0,
      }),
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Relay Retry Test',
      text: 'relay retry body',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
    },
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 1,
    },
  });
  retrySucceededAfterTransientFailure = retryFrames.length > 0;

  const strictClient = {
    stop: (): void => undefined,
    sendTextMessage: (): void => undefined,
    sendBinaryFrame: (
      args: {
        frame: Buffer;
      },
    ): void => {
      const parsed = parseRelayTunnelFrame({
        payload: args.frame,
      });
      if (parsed?.type !== 'smtp_end') {
        return;
      }

      setTimeout((): void => {
        handleRelayDeliveryControlMessage({
          relayClient: strictClient,
          payload: {
            type: 'relay_delivery_result',
            streamId: parsed.streamId,
            status: 'sent',
          },
        });
      }, 0);
    },
    readStatus: (): { connected: boolean; authenticated: boolean; reconnectAttempt: number } => ({
      connected: true,
      authenticated: true,
      reconnectAttempt: 0,
    }),
  };
  registerRelayClientDeliverySignals({
    relayClient: strictClient,
  });
  await sendGatewayReplyViaRelay({
    relayClient: strictClient,
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'persona@example.com' },
      subject: 'Relay Strict Delivery Test',
      text: 'relay strict delivery body',
      inReplyTo: '<inbound@example.com>',
      references: ['<root@example.com>'],
    },
  });
  strictDeliverySignalSucceeded = true;

  const failingClient = {
    stop: (): void => undefined,
    sendTextMessage: (): void => undefined,
    sendBinaryFrame: (
      args: {
        frame: Buffer;
      },
    ): void => {
      const parsed = parseRelayTunnelFrame({
        payload: args.frame,
      });
      if (parsed?.type !== 'smtp_end') {
        return;
      }

      setTimeout((): void => {
        handleRelayDeliveryControlMessage({
          relayClient: failingClient,
          payload: {
            type: 'relay_delivery_result',
            streamId: parsed.streamId,
            status: 'failed',
            error: 'mx_rejected',
          },
        });
      }, 0);
    },
    readStatus: (): { connected: boolean; authenticated: boolean; reconnectAttempt: number } => ({
      connected: true,
      authenticated: true,
      reconnectAttempt: 0,
    }),
  };
  registerRelayClientDeliverySignals({
    relayClient: failingClient,
  });
  try {
    await sendGatewayReplyViaRelay({
      relayClient: failingClient,
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
      request: {
        to: [{ address: 'receiver@example.com' }],
        from: { address: 'persona@example.com' },
        subject: 'Relay Strict Delivery Failure Test',
        text: 'relay strict delivery failure body',
        inReplyTo: '<inbound@example.com>',
        references: ['<root@example.com>'],
      },
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 1,
      },
    });
  } catch (error) {
    strictDeliverySignalFailureMessage = (error as Error).message;
  }
});

describe('gateway outbound relay helpers', () => {
  it('deduplicates envelope recipients across to/cc/bcc', () => {
    expect(envelopeRecipientCount).toBe(2);
  });

  it('renders MIME output with subject for relay forwarding', () => {
    expect(renderedMimeContainsSubject).toBe(true);
  });

  it('renders MIME output with attachment metadata for relay forwarding', () => {
    expect(relayMimeContainsAttachmentFilename).toBe(true);
  });

  it('sends relay tunnel frames for outbound relay delivery', () => {
    expect(relayedFrameCount >= 3).toBe(true);
  });

  it('starts outbound relay streams with smtp_start frame', () => {
    expect(relayedStartType).toBe('smtp_start');
  });

  it('sends outbound relay message bytes as smtp_chunk frames', () => {
    expect(relayedChunkType).toBe('smtp_chunk');
  });

  it('ends outbound relay streams with smtp_end frame', () => {
    expect(relayedEndType).toBe('smtp_end');
  });

  it('includes outbound body content in relay chunk payload', () => {
    expect(relayedChunkPayloadHasBody).toBe(true);
  });

  it('returns non-empty message ids for relay-sent messages', () => {
    expect(relayedMessageIdLength > 0).toBe(true);
  });

  it('splits buffers into expected chunk counts', () => {
    expect(chunkCount).toBe(3);
  });

  it('throws when chunk size is zero or negative', () => {
    expect(invalidChunkSizeThrows).toBe(true);
  });

  it('retries relay sends after transient frame send failures', () => {
    expect(retrySucceededAfterTransientFailure).toBe(true);
  });

  it('attempts relay frame sends multiple times when retry policy allows', () => {
    expect(retryAttemptCount > 1).toBe(true);
  });

  it('supports strict relay delivery signaling when control messages are registered', () => {
    expect(strictDeliverySignalSucceeded).toBe(true);
  });

  it('fails strict relay sends when delivery signal reports failed', () => {
    expect(strictDeliverySignalFailureMessage.includes('mx_rejected')).toBe(true);
  });
});
