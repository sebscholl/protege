import { beforeAll, describe, expect, it } from 'vitest';

import {
  applyRelayOutboundTunnelFrame,
  createRelayOutboundTunnelState,
  readRecipientDomain,
  resolveRelayOutboundTarget,
  sendRelayOutboundMime,
  sendRelayOutboundViaMx,
  stripTrailingDot,
  toRelayStreamKey,
} from '@relay/src/outbound';

let streamKey = '';
let ignoredBeforeStart = '';
let completedMailFrom = '';
let completedRcptTo = '';
let completedRawMime = '';
let streamRemovedAfterEnd = false;
let retryAttemptCount = 0;
let retryMessageId = '';
let retryErrorCount = 0;
let exhaustedRetryThrows = false;
let resolvedMxHost = '';
let resolvedFallbackHost = '';
let invalidRecipientThrows = false;
let strippedMxHost = '';
let sendViaMxEnvelopeFrom = '';
let sendViaMxEnvelopeTo = '';
let sendViaMxRawMime = '';
let sendViaMxClosed = false;
let sendViaMxMessageId = '';

beforeAll(async (): Promise<void> => {
  const state = createRelayOutboundTunnelState();
  streamKey = toRelayStreamKey({
    socketId: 'socket-1',
    streamId: 'stream-1',
  });
  ignoredBeforeStart = applyRelayOutboundTunnelFrame({
    state,
    socketId: 'socket-1',
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-1',
      chunk: Buffer.from('missing-start', 'utf8'),
    },
  }).ignoredReason ?? '';

  applyRelayOutboundTunnelFrame({
    state,
    socketId: 'socket-1',
    frame: {
      type: 'smtp_start',
      streamId: 'stream-1',
      mailFrom: 'persona@mail.protege.bot',
      rcptTo: 'user@example.com',
    },
  });
  applyRelayOutboundTunnelFrame({
    state,
    socketId: 'socket-1',
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-1',
      chunk: Buffer.from('hello ', 'utf8'),
    },
  });
  applyRelayOutboundTunnelFrame({
    state,
    socketId: 'socket-1',
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-1',
      chunk: Buffer.from('world', 'utf8'),
    },
  });
  const completed = applyRelayOutboundTunnelFrame({
    state,
    socketId: 'socket-1',
    frame: {
      type: 'smtp_end',
      streamId: 'stream-1',
    },
  }).completed;
  completedMailFrom = completed?.mailFrom ?? '';
  completedRcptTo = completed?.rcptTo ?? '';
  completedRawMime = completed?.rawMimeBuffer.toString('utf8') ?? '';
  streamRemovedAfterEnd = state.has(streamKey) === false;

  let transientAttempt = 0;
  const retrySuccessResult = await sendRelayOutboundMime({
    delivery: {
      streamKey,
      mailFrom: 'persona@mail.protege.bot',
      rcptTo: 'user@example.com',
      rawMimeBuffer: Buffer.from('mime', 'utf8'),
    },
    sendMailFn: async (): Promise<{ messageId: string }> => {
      transientAttempt += 1;
      if (transientAttempt === 1) {
        throw new Error('transient_send_failure');
      }

      return {
        messageId: '<relay-success@example.com>',
      };
    },
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 1,
    },
    onAttemptError: (): void => {
      retryErrorCount += 1;
    },
  });
  retryAttemptCount = retrySuccessResult.attemptCount;
  retryMessageId = retrySuccessResult.messageId ?? '';

  try {
    await sendRelayOutboundMime({
      delivery: {
        streamKey,
        mailFrom: 'persona@mail.protege.bot',
        rcptTo: 'user@example.com',
        rawMimeBuffer: Buffer.from('mime', 'utf8'),
      },
      sendMailFn: async (): Promise<{ messageId: string }> => {
        throw new Error('persistent_send_failure');
      },
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 1,
      },
    });
  } catch {
    exhaustedRetryThrows = true;
  }

  resolvedMxHost = (await resolveRelayOutboundTarget({
    rcptTo: 'user@example.com',
    resolveMxFn: async (): Promise<{ priority: number; exchange: string }[]> => [
      {
        priority: 20,
        exchange: 'mx-20.example.com.',
      },
      {
        priority: 10,
        exchange: 'mx-10.example.com.',
      },
    ],
  })).host;
  resolvedFallbackHost = (await resolveRelayOutboundTarget({
    rcptTo: 'user@example.net',
    resolveMxFn: async (): Promise<{ priority: number; exchange: string }[]> => [],
    resolve4Fn: async (): Promise<string[]> => ['203.0.113.5'],
    resolve6Fn: async (): Promise<string[]> => [],
  })).host;
  try {
    readRecipientDomain({
      rcptTo: 'invalid-address',
    });
  } catch {
    invalidRecipientThrows = true;
  }
  strippedMxHost = stripTrailingDot({
    value: 'mx.example.com.',
  });
  sendViaMxMessageId = (await sendRelayOutboundViaMx({
    delivery: {
      streamKey: 'socket:stream',
      mailFrom: 'persona@mail.protege.bot',
      rcptTo: 'user@example.org',
      rawMimeBuffer: Buffer.from('raw payload', 'utf8'),
    },
    resolveOutboundTargetFn: async (): Promise<{ host: string; port: number }> => ({
      host: 'mx.example.org',
      port: 25,
    }),
    createTransportFn: (): {
      sendMail: (args: { envelope: { from: string; to: string[] }; raw: Buffer }) => Promise<{ messageId: string }>;
      close: () => void;
    } => ({
      sendMail: async (args): Promise<{ messageId: string }> => {
        sendViaMxEnvelopeFrom = args.envelope.from;
        sendViaMxEnvelopeTo = args.envelope.to.join(',');
        sendViaMxRawMime = args.raw.toString('utf8');
        return {
          messageId: '<mx-delivered@example.org>',
        };
      },
      close: (): void => {
        sendViaMxClosed = true;
      },
    }),
  })).messageId ?? '';
});

describe('relay outbound tunnel frame assembly', () => {
  it('builds one deterministic stream key from socket and stream ids', () => {
    expect(streamKey).toBe('socket-1:stream-1');
  });

  it('ignores smtp_chunk frames received before smtp_start', () => {
    expect(ignoredBeforeStart).toBe('stream_not_started');
  });

  it('keeps sender metadata from smtp_start for completed deliveries', () => {
    expect(completedMailFrom).toBe('persona@mail.protege.bot');
  });

  it('keeps recipient metadata from smtp_start for completed deliveries', () => {
    expect(completedRcptTo).toBe('user@example.com');
  });

  it('concatenates smtp_chunk bytes into one completed raw mime payload', () => {
    expect(completedRawMime).toBe('hello world');
  });

  it('removes in-flight stream state after smtp_end completion', () => {
    expect(streamRemovedAfterEnd).toBe(true);
  });
});

describe('relay outbound smtp delivery', () => {
  it('retries once and succeeds for transient outbound smtp failures', () => {
    expect(retryAttemptCount).toBe(2);
  });

  it('returns relay outbound message id when smtp send succeeds', () => {
    expect(retryMessageId).toBe('<relay-success@example.com>');
  });

  it('emits retry callback events for failed attempts before success', () => {
    expect(retryErrorCount).toBe(1);
  });

  it('throws when outbound smtp delivery exhausts retry attempts', () => {
    expect(exhaustedRetryThrows).toBe(true);
  });
});

describe('relay outbound target resolution and direct mx send', () => {
  it('selects lowest-priority mx exchange host when mx records exist', () => {
    expect(resolvedMxHost).toBe('mx-10.example.com');
  });

  it('falls back to recipient domain when mx is missing and a/aaaa exist', () => {
    expect(resolvedFallbackHost).toBe('example.net');
  });

  it('throws for invalid recipient addresses missing a domain part', () => {
    expect(invalidRecipientThrows).toBe(true);
  });

  it('normalizes dns fqdn hosts by stripping one trailing dot', () => {
    expect(strippedMxHost).toBe('mx.example.com');
  });

  it('uses raw mime payload unchanged when sending directly via mx', () => {
    expect(sendViaMxRawMime).toBe('raw payload');
  });

  it('sends direct mx envelope from as provided by outbound delivery', () => {
    expect(sendViaMxEnvelopeFrom).toBe('persona@mail.protege.bot');
  });

  it('sends direct mx envelope recipient from outbound delivery target', () => {
    expect(sendViaMxEnvelopeTo).toBe('user@example.org');
  });

  it('closes transport after direct mx send completion', () => {
    expect(sendViaMxClosed).toBe(true);
  });

  it('returns message id from direct mx send results', () => {
    expect(sendViaMxMessageId).toBe('<mx-delivered@example.org>');
  });
});
