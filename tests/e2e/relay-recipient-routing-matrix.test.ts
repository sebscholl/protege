import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTransport } from 'nodemailer';

import { createRelayRuntimeState } from '@relay/src/index';
import { activateRelaySession } from '@relay/src/session-registry';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { startRelaySmtpServer, stopRelaySmtpServer } from '@relay/src/smtp-server';
import { createRelayRateLimitState } from '@relay/src/rate-limit';

let smtpPort = 0;
let noRecipientRejectCode = 0;
let noRecipientRejectResponse = '';
let partialAcceptedRecipients: string[] = [];
let partialRejectedRecipients: string[] = [];
let allValidAcceptedRecipients: string[] = [];
let capAcceptedRecipients: string[] = [];
let capRejectedRecipients: string[] = [];
let alphaFramesCount = 0;
let bravoFramesCount = 0;
let frameChunkPayloadObserved = false;
let rejectedEvents: Array<{ recipientAddress: string; reason: string }> = [];
let smtpServer: Awaited<ReturnType<typeof startRelaySmtpServer>> | undefined;

type RelaySmtpDeliveryError = {
  responseCode?: number;
  response?: string;
};

/**
 * Finds one available localhost TCP port for SMTP test listener startup.
 */
async function readEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve probe socket address.'));
        return;
      }
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

/**
 * Sends one SMTP message through local relay ingress and returns nodemailer delivery metadata.
 */
async function sendSmtpMessage(
  args: {
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    text: string;
  },
): Promise<{
  accepted: string[];
  rejected: string[];
}> {
  const transport = createTransport({
    host: '127.0.0.1',
    port: smtpPort,
    secure: false,
    tls: {
      rejectUnauthorized: false,
    },
  });
  try {
    const info = await transport.sendMail({
      from: args.from,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      text: args.text,
    });
    return {
      accepted: info.accepted.map((value) => String(value)),
      rejected: info.rejected.map((value) => String(value)),
    };
  } finally {
    transport.close();
  }
}

beforeAll(async (): Promise<void> => {
  smtpPort = await readEphemeralPort();
  const runtimeState = createRelayRuntimeState();
  const alphaFrames: Buffer[] = [];
  const bravoFrames: Buffer[] = [];
  rejectedEvents = [];

  activateRelaySession({
    registry: runtimeState.sessionRegistry,
    publicKeyBase32: 'alpha',
    socket: {
      id: 'alpha-socket',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          alphaFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    sessionRole: 'inbound',
    nowIso: '2026-03-07T00:00:00.000Z',
  });
  activateRelaySession({
    registry: runtimeState.sessionRegistry,
    publicKeyBase32: 'bravo',
    socket: {
      id: 'bravo-socket',
      send: (payload: string | Buffer): void => {
        if (Buffer.isBuffer(payload)) {
          bravoFrames.push(payload);
        }
      },
      close: (): void => undefined,
    },
    sessionRole: 'inbound',
    nowIso: '2026-03-07T00:00:00.000Z',
  });

  smtpServer = await startRelaySmtpServer({
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: smtpPort,
      maxMessageBytes: 1024 * 1024,
      maxRecipients: 2,
    },
    rateLimits: {
      connectionsPerMinutePerIp: 200,
      messagesPerMinutePerIp: 200,
      denyWindowMs: 5_000,
    },
    rateLimitState: createRelayRateLimitState(),
    runtimeState,
    onRejected: (
      args: {
        recipientAddress: string;
        reason: string;
      },
    ): void => {
      rejectedEvents.push(args);
    },
  });

  try {
    await sendSmtpMessage({
      from: 'sender@example.com',
      to: ['missing@relay-protege-mail.com'],
      subject: 'none-valid',
      text: 'none valid recipients',
    });
  } catch (error) {
    const smtpError = error as RelaySmtpDeliveryError;
    noRecipientRejectCode = smtpError.responseCode ?? 0;
    noRecipientRejectResponse = smtpError.response ?? '';
  }

  const partialResult = await sendSmtpMessage({
    from: 'sender@example.com',
    to: ['alpha@relay-protege-mail.com'],
    cc: ['missing@relay-protege-mail.com'],
    subject: 'partial-valid',
    text: 'partial valid recipients',
  });
  partialAcceptedRecipients = partialResult.accepted;
  partialRejectedRecipients = partialResult.rejected;

  const allValidResult = await sendSmtpMessage({
    from: 'sender@example.com',
    to: ['alpha@relay-protege-mail.com'],
    cc: ['bravo@relay-protege-mail.com'],
    subject: 'all-valid',
    text: 'all valid recipients',
  });
  allValidAcceptedRecipients = allValidResult.accepted;

  const capResult = await sendSmtpMessage({
    from: 'sender@example.com',
    to: ['alpha@relay-protege-mail.com'],
    cc: ['bravo@relay-protege-mail.com', 'charlie@relay-protege-mail.com'],
    subject: 'recipient-cap',
    text: 'recipient cap overflow',
  });
  capAcceptedRecipients = capResult.accepted;
  capRejectedRecipients = capResult.rejected;

  alphaFramesCount = alphaFrames.length;
  bravoFramesCount = bravoFrames.length;
  frameChunkPayloadObserved = alphaFrames.concat(bravoFrames).some((frame) => {
    const parsed = parseRelayTunnelFrame({
      payload: frame,
    });
    return parsed?.type === 'smtp_chunk'
      && parsed.chunk.toString('utf8').includes('all valid recipients');
  });
});

afterAll(async (): Promise<void> => {
  if (smtpServer) {
    await stopRelaySmtpServer({
      server: smtpServer,
    });
  }
});

describe('relay recipient routing matrix e2e', () => {
  it('rejects SMTP messages when no relay recipients are deliverable', () => {
    expect(noRecipientRejectCode).toBe(450);
  });

  it('returns deterministic rejection response for no-deliverable rcpt stage failures', () => {
    expect(noRecipientRejectResponse.includes('relay_rejected_recipient_not_connected')).toBe(true);
  });

  it('accepts partial recipient sets when at least one recipient is routable', () => {
    expect(partialAcceptedRecipients).toEqual(['alpha@relay-protege-mail.com']);
  });

  it('reports rejected recipients in partial recipient SMTP submissions', () => {
    expect(partialRejectedRecipients).toEqual(['missing@relay-protege-mail.com']);
  });

  it('accepts all relay recipients when every recipient is routable', () => {
    expect(allValidAcceptedRecipients).toEqual([
      'alpha@relay-protege-mail.com',
      'bravo@relay-protege-mail.com',
    ]);
  });

  it('accepts only up-to-cap recipients when recipient cap is exceeded', () => {
    expect(capAcceptedRecipients).toEqual([
      'alpha@relay-protege-mail.com',
      'bravo@relay-protege-mail.com',
    ]);
  });

  it('reports recipient-cap overflow recipients as rejected at SMTP client surface', () => {
    expect(capRejectedRecipients).toEqual(['charlie@relay-protege-mail.com']);
  });

  it('delivers tunnel frames to all connected accepted recipients', () => {
    expect([alphaFramesCount > 0, bravoFramesCount > 0]).toEqual([true, true]);
  });

  it('forwards SMTP chunk payload content through relay tunnel frames', () => {
    expect(frameChunkPayloadObserved).toBe(true);
  });

  it('records per-recipient rejection reasons for operational observability', () => {
    expect(rejectedEvents.some((event) => event.reason === 'recipient_not_connected')).toBe(true);
  });

  it('records per-recipient cap-overflow reasons for operational observability', () => {
    expect(rejectedEvents.some((event) => event.reason === 'too_many_recipients')).toBe(true);
  });
});
