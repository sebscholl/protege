import type { SMTPServerAddress, SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { PassThrough, Readable } from 'node:stream';
import { beforeAll, describe, expect, it } from 'vitest';

import { createRelayRuntimeState } from '@relay/src/index';
import { createRelayRateLimitState } from '@relay/src/rate-limit';
import { activateRelaySession } from '@relay/src/session-registry';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import {
  createRelaySmtpDataHandler,
  createRelaySmtpRecipientHandler,
  readRelaySmtpStreamBuffer,
  rejectRelaySmtpDataStream,
} from '@relay/src/smtp-server';

let streamReadResult = '';
let acceptedErrorMessage = '';
let acceptedFramesCount = 0;
let acceptedStartType = '';
let acceptedChunkPayload = '';
let acceptedEndType = '';
let rejectedResponseCode = 0;
let rejectedReason = '';
let tooLargeResponseCode = 0;
let tooLargeReason = '';
let rateLimitedResponseCode = 0;
let rateLimitedReason = '';
let fanoutAcceptedCount = 0;
let fanoutFramesCount = 0;
let preRejectInvokedBeforeEnd = false;
let rcptUnavailableResponseCode = 0;
let rcptUnavailableReason = '';
let rcptUnavailableCallbackReason = '';
let rcptTooManyCallbackReason = '';

/**
 * Creates one readable SMTP stream from one UTF-8 string payload.
 */
function createDataStream(
  args: {
    value: string;
  },
): SMTPServerDataStream {
  return Readable.from([Buffer.from(args.value, 'utf8')]) as SMTPServerDataStream;
}

/**
 * Creates one minimal SMTP session envelope for relay SMTP handler tests.
 */
function createSmtpSession(
  args: {
    mailFrom: string;
    rcptTo: string;
    rcptToList?: string[];
    remoteAddress?: string;
  },
): SMTPServerSession {
  return {
    id: 'session-1',
    remoteAddress: args.remoteAddress,
    envelope: {
      mailFrom: {
        address: args.mailFrom,
        args: false,
      },
      rcptTo: (args.rcptToList ?? [args.rcptTo]).map((rcptTo) => ({
        address: rcptTo,
        args: false,
      })),
    },
  } as unknown as SMTPServerSession;
}

/**
 * Decodes one smtp_chunk payload text from one parsed frame.
 */
function decodeChunkPayload(
  args: {
    frame: ReturnType<typeof parseRelayTunnelFrame>;
  },
): string {
  if (args.frame?.type !== 'smtp_chunk') {
    return '';
  }

  return args.frame.chunk.toString('utf8');
}

beforeAll(async (): Promise<void> => {
  streamReadResult = (await readRelaySmtpStreamBuffer({
    stream: createDataStream({
      value: 'hello smtp',
    }),
  })).toString('utf8');

  const runtimeState = createRelayRuntimeState();
  const rateLimitState = createRelayRateLimitState();
  const sentFrames: Buffer[] = [];
  activateRelaySession({
    registry: runtimeState.sessionRegistry,
    publicKeyBase32: 'persona-a',
    socket: {
      id: 'socket-a',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          sentFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    sessionRole: 'inbound',
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  const onAccepted = createRelaySmtpDataHandler({
    smtpConfig: {
      maxMessageBytes: 1024 * 1024,
      maxRecipients: 5,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 100,
      messagesPerMinutePerIp: 100,
      denyWindowMs: 1000,
    },
    rateLimitState,
    runtimeState,
    nowMs: (): number => Date.now(),
  });
  await new Promise<void>((resolve): void => {
    onAccepted(
      createDataStream({
        value: 'raw mime content',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
      }),
      (error?: Error | null): void => {
        acceptedErrorMessage = error?.message ?? '';
        resolve();
      },
    );
  });
  acceptedFramesCount = sentFrames.length;
  acceptedStartType = parseRelayTunnelFrame({
    payload: sentFrames[0],
  })?.type ?? '';
  acceptedChunkPayload = decodeChunkPayload({
    frame: parseRelayTunnelFrame({
      payload: sentFrames[1],
    }),
  });
  acceptedEndType = parseRelayTunnelFrame({
    payload: sentFrames[2],
  })?.type ?? '';

  const runtimeRejected = createRelayRuntimeState();
  const onRejected = createRelaySmtpDataHandler({
    smtpConfig: {
      maxMessageBytes: 1024 * 1024,
      maxRecipients: 5,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 100,
      messagesPerMinutePerIp: 100,
      denyWindowMs: 1000,
    },
    rateLimitState: createRelayRateLimitState(),
    runtimeState: runtimeRejected,
    nowMs: (): number => Date.now(),
  });
  await new Promise<void>((resolve): void => {
    onRejected(
      createDataStream({
        value: 'raw mime content',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-missing@relay-protege-mail.com',
      }),
      (error?: Error | null): void => {
        rejectedResponseCode = (error as { responseCode?: number } | undefined)?.responseCode ?? 0;
        rejectedReason = error?.message ?? '';
        resolve();
      },
    );
  });

  const runtimeFanout = createRelayRuntimeState();
  const fanoutFrames: Buffer[] = [];
  activateRelaySession({
    registry: runtimeFanout.sessionRegistry,
    publicKeyBase32: 'persona-a',
    socket: {
      id: 'socket-fa',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          fanoutFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    sessionRole: 'inbound',
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  activateRelaySession({
    registry: runtimeFanout.sessionRegistry,
    publicKeyBase32: 'persona-b',
    socket: {
      id: 'socket-fb',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          fanoutFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    sessionRole: 'inbound',
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  const onFanout = createRelaySmtpDataHandler({
    smtpConfig: {
      maxMessageBytes: 1024 * 1024,
      maxRecipients: 5,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 100,
      messagesPerMinutePerIp: 100,
      denyWindowMs: 1000,
    },
    rateLimitState: createRelayRateLimitState(),
    runtimeState: runtimeFanout,
    onAccepted: (): void => {
      fanoutAcceptedCount += 1;
    },
    nowMs: (): number => Date.now(),
  });
  await new Promise<void>((resolve): void => {
    onFanout(
      createDataStream({
        value: 'raw mime content',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
        rcptToList: [
          'persona-a@relay-protege-mail.com',
          'persona-b@relay-protege-mail.com',
        ],
      }),
      (): void => {
        resolve();
      },
    );
  });
  fanoutFramesCount = fanoutFrames.length;

  const onTooLarge = createRelaySmtpDataHandler({
    smtpConfig: {
      maxMessageBytes: 3,
      maxRecipients: 5,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 100,
      messagesPerMinutePerIp: 100,
      denyWindowMs: 1000,
    },
    rateLimitState: createRelayRateLimitState(),
    runtimeState: createRelayRuntimeState(),
    nowMs: (): number => Date.now(),
  });
  await new Promise<void>((resolve): void => {
    onTooLarge(
      createDataStream({
        value: 'raw mime content',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
      }),
      (error?: Error | null): void => {
        tooLargeResponseCode = (error as { responseCode?: number } | undefined)?.responseCode ?? 0;
        tooLargeReason = error?.message ?? '';
        resolve();
      },
    );
  });

  const rateLimitStateMessage = createRelayRateLimitState();
  const onRateLimited = createRelaySmtpDataHandler({
    smtpConfig: {
      maxMessageBytes: 1024 * 1024,
      maxRecipients: 5,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 100,
      messagesPerMinutePerIp: 1,
      denyWindowMs: 60_000,
    },
    rateLimitState: rateLimitStateMessage,
    runtimeState: createRelayRuntimeState(),
    nowMs: (): number => 0,
  });
  await new Promise<void>((resolve): void => {
    onRateLimited(
      createDataStream({
        value: 'first message',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
        remoteAddress: '127.0.0.1',
      }),
      (): void => {
        resolve();
      },
    );
  });
  await new Promise<void>((resolve): void => {
    onRateLimited(
      createDataStream({
        value: 'second message',
      }),
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
        remoteAddress: '127.0.0.1',
      }),
      (error?: Error | null): void => {
        rateLimitedResponseCode = (error as { responseCode?: number } | undefined)?.responseCode ?? 0;
        rateLimitedReason = error?.message ?? '';
        resolve();
      },
    );
  });

  const runtimeRcpt = createRelayRuntimeState();
  const onRcpt = createRelaySmtpRecipientHandler({
    smtpConfig: {
      maxRecipients: 1,
    },
    runtimeState: runtimeRcpt,
    onRejected: (
      args: {
        recipientAddress: string;
        reason: string;
        stage: 'rcpt' | 'data';
      },
    ): void => {
      if (args.recipientAddress === 'persona-missing@relay-protege-mail.com') {
        rcptUnavailableCallbackReason = args.reason;
      }
      if (args.recipientAddress === 'persona-other@relay-protege-mail.com') {
        rcptTooManyCallbackReason = args.reason;
      }
    },
  });
  const rcptSession = createSmtpSession({
    mailFrom: 'sender@example.com',
    rcptTo: 'persona-a@relay-protege-mail.com',
    rcptToList: [],
  });
  await new Promise<void>((resolve): void => {
    onRcpt(
      {
        address: 'persona-missing@relay-protege-mail.com',
        args: {},
      } as SMTPServerAddress,
      rcptSession,
      (error?: Error | null): void => {
        rcptUnavailableResponseCode = (error as { responseCode?: number } | undefined)?.responseCode ?? 0;
        rcptUnavailableReason = error?.message ?? '';
        resolve();
      },
    );
  });
  await new Promise<void>((resolve): void => {
    onRcpt(
      {
        address: 'persona-other@relay-protege-mail.com',
        args: {},
      } as SMTPServerAddress,
      createSmtpSession({
        mailFrom: 'sender@example.com',
        rcptTo: 'persona-a@relay-protege-mail.com',
      }),
      (): void => {
        resolve();
      },
    );
  });

  const drainingStream = new PassThrough() as SMTPServerDataStream;
  let ended = false;
  rejectRelaySmtpDataStream({
    stream: drainingStream,
    error: new Error('relay_rejected_too_many_recipients'),
    callback: (): void => {
      preRejectInvokedBeforeEnd = !ended;
    },
  });
  drainingStream.write('chunk');
  ended = true;
  drainingStream.end();
});

describe('relay smtp stream reading', () => {
  it('reads smtp stream bytes into one buffer', () => {
    expect(streamReadResult).toBe('hello smtp');
  });
});

describe('relay smtp recipient and data routing', () => {
  it('accepts smtp deliveries for connected recipient identities', () => {
    expect(acceptedErrorMessage).toBe('');
  });

  it('forwards accepted smtp deliveries as start/chunk/end tunnel frames', () => {
    expect(acceptedFramesCount).toBe(3);
  });

  it('emits smtp_start frame first for accepted deliveries', () => {
    expect(acceptedStartType).toBe('smtp_start');
  });

  it('emits raw smtp payload bytes in smtp_chunk frames', () => {
    expect(acceptedChunkPayload).toBe('raw mime content');
  });

  it('emits smtp_end frame after accepted delivery payload', () => {
    expect(acceptedEndType).toBe('smtp_end');
  });

  it('returns no-deliverable error when no accepted recipients can be delivered at data time', () => {
    expect(rejectedResponseCode).toBe(451);
  });

  it('returns stable no-deliverable rejection message at data time', () => {
    expect(rejectedReason).toBe('relay_rejected_no_deliverable_recipients');
  });

  it('fans out one accepted message to all accepted recipients', () => {
    expect(fanoutAcceptedCount).toBe(2);
  });

  it('sends start chunk end frames for each accepted recipient in fanout', () => {
    expect(fanoutFramesCount).toBe(6);
  });

  it('rejects smtp deliveries larger than configured message size', () => {
    expect(tooLargeResponseCode).toBe(552);
  });

  it('returns stable rejection message for oversized payloads', () => {
    expect(tooLargeReason).toBe('relay_rejected_message_too_large');
  });

  it('rejects smtp deliveries that exceed message rate limits', () => {
    expect(rateLimitedResponseCode).toBe(451);
  });

  it('returns stable rejection message for message rate limit violations', () => {
    expect(rateLimitedReason).toBe('relay_rejected_rate_limited');
  });

  it('rejects unavailable recipients at rcpt stage with transient code', () => {
    expect(rcptUnavailableResponseCode).toBe(450);
  });

  it('returns stable rcpt-stage rejection message for unavailable recipients', () => {
    expect(rcptUnavailableReason).toBe('relay_rejected_recipient_not_connected');
  });

  it('reports rcpt-stage unavailable recipient reason to rejection callback', () => {
    expect(rcptUnavailableCallbackReason).toBe('recipient_not_connected');
  });

  it('reports rcpt-stage too-many-recipients reason to rejection callback', () => {
    expect(rcptTooManyCallbackReason).toBe('too_many_recipients');
  });

  it('waits for smtp data stream end before precheck rejection callback', () => {
    expect(preRejectInvokedBeforeEnd).toBe(false);
  });
});
