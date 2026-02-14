import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { Readable } from 'node:stream';
import { beforeAll, describe, expect, it } from 'vitest';

import { createRelayRuntimeState } from '@relay/src/index';
import { activateRelaySession } from '@relay/src/session-registry';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createRelaySmtpDataHandler, readRelaySmtpStreamBuffer } from '@relay/src/smtp-server';

let streamReadResult = '';
let acceptedErrorMessage = '';
let acceptedFramesCount = 0;
let acceptedStartType = '';
let acceptedChunkPayload = '';
let acceptedEndType = '';
let rejectedResponseCode = 0;
let rejectedReason = '';

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
  },
): SMTPServerSession {
  return {
    id: 'session-1',
    envelope: {
      mailFrom: {
        address: args.mailFrom,
        args: false,
      },
      rcptTo: [
        {
          address: args.rcptTo,
          args: false,
        },
      ],
    },
  } as unknown as SMTPServerSession;
}

/**
 * Resolves one decoded smtp_chunk payload text from one optional tunnel frame.
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
    nowIso: '2026-02-14T00:00:00.000Z',
  });
  const onAccepted = createRelaySmtpDataHandler({
    runtimeState,
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
    runtimeState: runtimeRejected,
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
});

describe('relay smtp stream reading', () => {
  it('reads smtp stream bytes into one buffer', () => {
    expect(streamReadResult).toBe('hello smtp');
  });
});

describe('relay smtp data routing', () => {
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

  it('rejects smtp deliveries for missing recipient sessions with 550', () => {
    expect(rejectedResponseCode).toBe(550);
  });

  it('returns stable rejection message for missing recipient sessions', () => {
    expect(rejectedReason).toBe('relay_rejected_recipient_not_connected');
  });
});
