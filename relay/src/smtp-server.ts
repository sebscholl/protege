import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { SMTPServer } from 'smtp-server';

import type { RelayRuntimeState } from '@relay/src/index';
import { routeInboundSmtpToRelaySession } from '@relay/src/smtp-ingress';

/**
 * Represents one relay SMTP runtime configuration.
 */
export type RelaySmtpRuntimeConfig = {
  enabled: boolean;
  host: string;
  port: number;
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
    onData: createRelaySmtpDataHandler({
      runtimeState: args.runtimeState,
      onAccepted: args.onAccepted,
      onRejected: args.onRejected,
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
      },
    ) => void;
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
    void readRelaySmtpStreamBuffer({
      stream,
    }).then((chunkBuffer) => {
      const recipientAddress = session.envelope.rcptTo?.[0]?.address ?? '';
      const envelopeMailFrom = session.envelope.mailFrom;
      const mailFrom = envelopeMailFrom === false
        ? ''
        : envelopeMailFrom?.address ?? '';
      const result = routeInboundSmtpToRelaySession({
        registry: args.runtimeState.sessionRegistry,
        recipientAddress,
        mailFrom,
        chunkBuffers: [chunkBuffer],
      });
      if (!result.accepted || !result.streamId) {
        args.onRejected?.({
          recipientAddress,
          reason: result.reason ?? 'rejected',
        });
        callback(createRelaySmtpError({
          responseCode: result.reason === 'stream_write_failed' ? 451 : 550,
          message: `relay_rejected_${result.reason ?? 'unknown'}`,
        }));
        return;
      }

      args.onAccepted?.({
        recipientAddress,
        streamId: result.streamId,
      });
      callback();
    }).catch(() => {
      callback(createRelaySmtpError({
        responseCode: 451,
        message: 'relay_stream_read_failed',
      }));
    });
  };
}

/**
 * Reads one SMTP stream into a full byte buffer for relay session routing.
 */
export function readRelaySmtpStreamBuffer(
  args: {
    stream: SMTPServerDataStream;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    args.stream.on('data', (chunk: Buffer | string): void => {
      buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    args.stream.once('error', () => {
      reject(new Error('relay_stream_read_failed'));
    });
    args.stream.once('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
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
