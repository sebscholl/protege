import { beforeAll, describe, expect, it } from 'vitest';

import {
  chunkBuffer,
  deriveEnvelopeRecipients,
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
});

describe('gateway outbound relay helpers', () => {
  it('deduplicates envelope recipients across to/cc/bcc', () => {
    expect(envelopeRecipientCount).toBe(2);
  });

  it('renders MIME output with subject for relay forwarding', () => {
    expect(renderedMimeContainsSubject).toBe(true);
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
});
