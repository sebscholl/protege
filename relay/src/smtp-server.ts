import type { SMTPServerAddress, SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { createRelayAuthAttestation, type RelayAuthSignals } from '@relay/src/shared/relay-auth-attestation';
import { SMTPServer } from 'smtp-server';

import { evaluateRelayAuthSignals } from '@relay/src/auth-evaluator';
import type { RelayRuntimeState } from '@relay/src/index';
import { buildRelayRateLimitConfig, consumeRelayRateLimit } from '@relay/src/rate-limit';
import { resolveRelaySmtpRecipientRouteStatus, routeInboundSmtpToRelaySession } from '@relay/src/smtp-ingress';
import type { RelayRateLimitState } from '@relay/src/rate-limit';

/**
 * Represents one relay SMTP runtime configuration.
 */
export type RelaySmtpRuntimeConfig = {
  enabled: boolean;
  host: string;
  port: number;
  maxMessageBytes: number;
  maxRecipients: number;
};

/**
 * Represents one relay SMTP rate limit configuration payload.
 */
export type RelaySmtpRateLimitConfig = {
  connectionsPerMinutePerIp: number;
  messagesPerMinutePerIp: number;
  denyWindowMs: number;
};

/**
 * Represents one relay SMTP handler-level error with SMTP response code metadata.
 */
export type RelaySmtpError = Error & {
  responseCode: number;
};

/**
 * Starts one relay SMTP ingress server for inbound stream routing into authenticated sessions.
 */
export function startRelaySmtpServer(
  args: {
    config: RelaySmtpRuntimeConfig;
    attestationConfig?: {
      enabled: boolean;
      keyId: string;
      signingPrivateKeyPem: string;
    };
    rateLimits: RelaySmtpRateLimitConfig;
    rateLimitState: RelayRateLimitState;
    runtimeState: RelayRuntimeState;
    onAccepted?: (
      args: {
        recipientAddress: string;
        streamId: string;
      },
    ) => void;
    onRejected?: (
      args: {
        recipientAddress: string;
        reason: string;
        stage: 'rcpt' | 'data';
      },
    ) => void;
  },
): Promise<SMTPServer | undefined> {
  if (!args.config.enabled) {
    return Promise.resolve(undefined);
  }

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS', 'AUTH'],
    onConnect: createRelaySmtpConnectHandler({
      rateLimits: args.rateLimits,
      rateLimitState: args.rateLimitState,
      nowMs: (): number => Date.now(),
    }),
    onRcptTo: createRelaySmtpRecipientHandler({
      smtpConfig: args.config,
      runtimeState: args.runtimeState,
      onRejected: args.onRejected,
    }),
    onData: createRelaySmtpDataHandler({
      smtpConfig: args.config,
      attestationConfig: args.attestationConfig,
      rateLimits: args.rateLimits,
      rateLimitState: args.rateLimitState,
      runtimeState: args.runtimeState,
      onAccepted: args.onAccepted,
      onRejected: args.onRejected,
      nowMs: (): number => Date.now(),
    }),
  });

  return new Promise((resolve, reject) => {
    server.listen(args.config.port, args.config.host, () => {
      resolve(server);
    });
    server.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Stops one relay SMTP ingress server.
 */
export async function stopRelaySmtpServer(
  args: {
    server: SMTPServer;
  },
): Promise<void> {
  await new Promise<void>((resolve) => {
    args.server.close(() => {
      resolve();
    });
  });
}

/**
 * Creates one relay SMTP onData handler that routes inbound streams into authenticated sessions.
 */
export function createRelaySmtpDataHandler(
  args: {
    smtpConfig: Pick<RelaySmtpRuntimeConfig, 'maxMessageBytes' | 'maxRecipients'>;
    attestationConfig?: {
      enabled: boolean;
      keyId: string;
      signingPrivateKeyPem: string;
    };
    rateLimits: RelaySmtpRateLimitConfig;
    rateLimitState: RelayRateLimitState;
    runtimeState: RelayRuntimeState;
    onAccepted?: (
      args: {
        recipientAddress: string;
        streamId: string;
      },
    ) => void;
    onRejected?: (
      args: {
        recipientAddress: string;
        reason: string;
        stage: 'rcpt' | 'data';
      },
    ) => void;
    evaluateAuthSignalsFn?: typeof evaluateRelayAuthSignals;
    nowMs: () => number;
  },
): (
  stream: SMTPServerDataStream,
  session: SMTPServerSession,
  callback: (error?: Error | null) => void,
) => void {
  return (
    stream: SMTPServerDataStream,
    session: SMTPServerSession,
    callback: (error?: Error | null) => void,
    ): void => {
    const attestationConfig = args.attestationConfig ?? {
      enabled: false,
      keyId: '',
      signingPrivateKeyPem: '',
    };
    const recipientAddress = session.envelope.rcptTo?.[0]?.address ?? '';
    const remoteAddress = readRelaySmtpRemoteAddress({
      session,
    });
    const messageRateLimit = consumeRelayRateLimit({
      state: args.rateLimitState,
      key: `smtp:message:${remoteAddress}`,
      config: buildRelayRateLimitConfig({
        perMinute: args.rateLimits.messagesPerMinutePerIp,
        denyWindowMs: args.rateLimits.denyWindowMs,
      }),
      nowMs: args.nowMs(),
    });
    if (!messageRateLimit.allowed) {
      args.onRejected?.({
        recipientAddress,
        reason: 'rate_limited',
        stage: 'data',
      });
      rejectRelaySmtpDataStream({
        stream,
        callback,
        error: createRelaySmtpError({
          responseCode: 451,
          message: 'relay_rejected_rate_limited',
        }),
      });
      return;
    }

    void readRelaySmtpStreamBuffer({
      stream,
      maxBytes: args.smtpConfig.maxMessageBytes,
    }).then(async (chunkBuffer) => {
      const evaluateAuthSignalsFn = args.evaluateAuthSignalsFn ?? evaluateRelayAuthSignals;
      const envelopeMailFrom = session.envelope.mailFrom;
      const mailFrom = envelopeMailFrom === false
        ? ''
        : envelopeMailFrom?.address ?? '';
      const authSignals = await evaluateAuthSignalsFn({
        rawMimeBuffer: chunkBuffer,
        session,
        mailFrom,
      });
      const acceptedRecipients = session.envelope.rcptTo ?? [];
      let acceptedDeliveryCount = 0;
      for (const recipient of acceptedRecipients) {
        const streamId = readRelaySmtpStreamId({
          recipientAddress: recipient.address,
          session,
        });
        const authAttestation = buildRelayAuthAttestation({
          enabled: attestationConfig.enabled,
          keyId: attestationConfig.keyId,
          signingPrivateKeyPem: attestationConfig.signingPrivateKeyPem,
          streamId,
          mailFrom,
          rcptTo: recipient.address,
          authSignals,
        });
        const result = routeInboundSmtpToRelaySession({
          registry: args.runtimeState.sessionRegistry,
          recipientAddress: recipient.address,
          mailFrom,
          chunkBuffers: [chunkBuffer],
          streamId,
          authAttestation,
        });
        if (!result.accepted || !result.streamId) {
          args.onRejected?.({
            recipientAddress: recipient.address,
            reason: result.reason ?? 'rejected',
            stage: 'data',
          });
          continue;
        }

        args.onAccepted?.({
          recipientAddress: recipient.address,
          streamId: result.streamId,
        });
        acceptedDeliveryCount += 1;
      }
      if (acceptedDeliveryCount === 0) {
        callback(createRelaySmtpError({
          responseCode: 451,
          message: 'relay_rejected_no_deliverable_recipients',
        }));
        return;
      }
      callback();
    }).catch((error: Error) => {
      if (error.message === 'relay_stream_too_large') {
        args.onRejected?.({
          recipientAddress,
          reason: 'message_too_large',
          stage: 'data',
        });
        callback(createRelaySmtpError({
          responseCode: 552,
          message: 'relay_rejected_message_too_large',
        }));
        return;
      }
      callback(createRelaySmtpError({
        responseCode: 451,
        message: 'relay_stream_read_failed',
      }));
    });
  };
}

/**
 * Creates one SMTP recipient handler for per-recipient routing validation.
 */
export function createRelaySmtpRecipientHandler(
  args: {
    smtpConfig: Pick<RelaySmtpRuntimeConfig, 'maxRecipients'>;
    runtimeState: RelayRuntimeState;
    onRejected?: (
      args: {
        recipientAddress: string;
        reason: string;
        stage: 'rcpt' | 'data';
      },
    ) => void;
  },
): (
  address: SMTPServerAddress,
  session: SMTPServerSession,
  callback: (error?: Error | null) => void,
) => void {
  return (
    address: SMTPServerAddress,
    session: SMTPServerSession,
    callback: (error?: Error | null) => void,
  ): void => {
    const acceptedRecipientCount = session.envelope.rcptTo?.length ?? 0;
    if (acceptedRecipientCount >= args.smtpConfig.maxRecipients) {
      args.onRejected?.({
        recipientAddress: address.address,
        reason: 'too_many_recipients',
        stage: 'rcpt',
      });
      callback(createRelaySmtpError({
        responseCode: 452,
        message: 'relay_rejected_too_many_recipients',
      }));
      return;
    }

    const routeStatus = resolveRelaySmtpRecipientRouteStatus({
      registry: args.runtimeState.sessionRegistry,
      recipientAddress: address.address,
    });
    if (!routeStatus.routable) {
      args.onRejected?.({
        recipientAddress: address.address,
        reason: routeStatus.reason ?? 'unknown',
        stage: 'rcpt',
      });
      callback(createRelaySmtpError({
        responseCode: routeStatus.reason === 'recipient_not_connected' ? 450 : 550,
        message: `relay_rejected_${routeStatus.reason ?? 'unknown'}`,
      }));
      return;
    }

    callback();
  };
}

/**
 * Creates one SMTP onConnect handler for per-IP connection rate limiting.
 */
export function createRelaySmtpConnectHandler(
  args: {
    rateLimits: RelaySmtpRateLimitConfig;
    rateLimitState: RelayRateLimitState;
    nowMs: () => number;
  },
): (
  session: SMTPServerSession,
  callback: (error?: Error | null) => void,
) => void {
  return (
    session: SMTPServerSession,
    callback: (error?: Error | null) => void,
  ): void => {
    const remoteAddress = readRelaySmtpRemoteAddress({
      session,
    });
    const connectionRateLimit = consumeRelayRateLimit({
      state: args.rateLimitState,
      key: `smtp:connect:${remoteAddress}`,
      config: buildRelayRateLimitConfig({
        perMinute: args.rateLimits.connectionsPerMinutePerIp,
        denyWindowMs: args.rateLimits.denyWindowMs,
      }),
      nowMs: args.nowMs(),
    });
    if (!connectionRateLimit.allowed) {
      callback(createRelaySmtpError({
        responseCode: 421,
        message: 'relay_rejected_connection_rate_limited',
      }));
      return;
    }

    callback();
  };
}

/**
 * Reads one SMTP stream into a full byte buffer for relay session routing.
 */
export function readRelaySmtpStreamBuffer(
  args: {
    stream: SMTPServerDataStream;
    maxBytes?: number;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;
    args.stream.on('data', (chunk: Buffer | string): void => {
      if (rejected) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (args.maxBytes && totalBytes > args.maxBytes) {
        rejected = true;
        reject(new Error('relay_stream_too_large'));
        return;
      }
      buffers.push(buffer);
    });
    args.stream.once('error', () => {
      reject(new Error('relay_stream_read_failed'));
    });
    args.stream.once('end', () => {
      if (rejected) {
        return;
      }
      resolve(Buffer.concat(buffers));
    });
  });
}

/**
 * Reads one remote IP text from SMTP session metadata.
 */
export function readRelaySmtpRemoteAddress(
  args: {
    session: SMTPServerSession;
  },
): string {
  const remoteAddress = (args.session as unknown as { remoteAddress?: string }).remoteAddress;
  return remoteAddress && remoteAddress.trim().length > 0
    ? remoteAddress.trim()
    : 'unknown';
}

/**
 * Creates one smtp-compatible error object with `responseCode` metadata.
 */
export function createRelaySmtpError(
  args: {
    responseCode: number;
    message: string;
  },
): RelaySmtpError {
  const error = new Error(args.message) as RelaySmtpError;
  error.responseCode = args.responseCode;
  return error;
}

/**
 * Drains one SMTP DATA stream before returning one rejection error callback.
 */
export function rejectRelaySmtpDataStream(
  args: {
    stream: SMTPServerDataStream;
    callback: (error?: Error | null) => void;
    error: Error;
  },
): void {
  let completed = false;
  const complete = (
    callbackArgs: {
      error?: Error | null;
    },
  ): void => {
    if (completed) {
      return;
    }
    completed = true;
    args.callback(callbackArgs.error ?? null);
  };
  args.stream.on('data', (): void => undefined);
  args.stream.once('error', () => {
    complete({
      error: args.error,
    });
  });
  args.stream.once('end', () => {
    complete({
      error: args.error,
    });
  });
  args.stream.resume();
}

/**
 * Builds one deterministic relay stream id for one SMTP recipient delivery.
 */
export function readRelaySmtpStreamId(
  args: {
    recipientAddress: string;
    session: SMTPServerSession;
  },
): string {
  return `${args.session.id}:${args.recipientAddress}`;
}

/**
 * Creates one signed relay auth attestation when relay attestation is enabled.
 */
export function buildRelayAuthAttestation(
  args: {
    enabled: boolean;
    keyId: string;
    signingPrivateKeyPem: string;
    streamId: string;
    mailFrom: string;
    rcptTo: string;
    authSignals: RelayAuthSignals;
  },
): ReturnType<typeof createRelayAuthAttestation> | undefined {
  if (!args.enabled) {
    return undefined;
  }

  return createRelayAuthAttestation({
    keyId: args.keyId,
    privateKeyPem: args.signingPrivateKeyPem,
    payload: {
      streamId: args.streamId,
      mailFrom: args.mailFrom,
      rcptTo: args.rcptTo,
      issuedAt: new Date().toISOString(),
      signals: args.authSignals,
    },
  });
}
