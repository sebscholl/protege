import type { TransportOptions } from 'nodemailer';

import type { RelayTunnelFrame } from '@relay/src/tunnel';

import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import { createTransport } from 'nodemailer';

/**
 * Represents one keyed outbound stream in-flight over relay websocket tunnel frames.
 */
export type RelayOutboundTunnelStream = {
  mailFrom: string;
  rcptTo: string;
  chunks: Buffer[];
};

/**
 * Represents state for in-flight outbound websocket streams keyed by socket and stream id.
 */
export type RelayOutboundTunnelState = Map<string, RelayOutboundTunnelStream>;

/**
 * Represents one completed outbound relay delivery payload assembled from tunnel frames.
 */
export type RelayCompletedOutboundDelivery = {
  streamKey: string;
  mailFrom: string;
  rcptTo: string;
  rawMimeBuffer: Buffer;
};

/**
 * Represents result metadata for one applied outbound tunnel frame.
 */
export type RelayApplyOutboundFrameResult = {
  completed?: RelayCompletedOutboundDelivery;
  ignoredReason?: 'stream_not_started';
};

/**
 * Represents retry policy for outbound relay SMTP delivery.
 */
export type RelayOutboundRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
};

/**
 * Creates one empty relay outbound tunnel state map.
 */
export function createRelayOutboundTunnelState(): RelayOutboundTunnelState {
  return new Map<string, RelayOutboundTunnelStream>();
}

/**
 * Applies one outbound tunnel frame and emits one completed MIME payload when stream ends.
 */
export function applyRelayOutboundTunnelFrame(
  args: {
    state: RelayOutboundTunnelState;
    socketId: string;
    frame: RelayTunnelFrame;
  },
): RelayApplyOutboundFrameResult {
  const streamKey = toRelayStreamKey({
    socketId: args.socketId,
    streamId: args.frame.streamId,
  });
  if (args.frame.type === 'smtp_start') {
    args.state.set(streamKey, {
      mailFrom: args.frame.mailFrom,
      rcptTo: args.frame.rcptTo,
      chunks: [],
    });
    return {};
  }

  const stream = args.state.get(streamKey);
  if (!stream) {
    return {
      ignoredReason: 'stream_not_started',
    };
  }

  if (args.frame.type === 'smtp_chunk') {
    stream.chunks.push(args.frame.chunk);
    return {};
  }

  args.state.delete(streamKey);
  return {
    completed: {
      streamKey,
      mailFrom: stream.mailFrom,
      rcptTo: stream.rcptTo,
      rawMimeBuffer: Buffer.concat(stream.chunks),
    },
  };
}

export type RelayOutboundTarget = {
  host: string;
  port: number;
};

export type RelayResolveMxFn = (
  hostname: string,
) => Promise<Array<{ priority: number; exchange: string }>>;

export type RelayResolveAddressFn = (
  hostname: string,
) => Promise<string[]>;

export type RelayOutboundSendMailResult = {
  messageId?: string;
};

export type RelayOutboundTransport = {
  sendMail: (
    args: {
      envelope: {
        from: string;
        to: string[];
      };
      raw: Buffer;
    },
  ) => Promise<RelayOutboundSendMailResult>;
  close?: () => void;
};

export type RelayOutboundSendMailFn = (
  args: {
    delivery: RelayCompletedOutboundDelivery;
    dkim?: RelayDkimSigningConfig;
  },
) => Promise<RelayOutboundSendMailResult>;

/**
 * Represents DKIM signing config used for direct outbound relay sends.
 */
export type RelayDkimSigningConfig = {
  enabled: boolean;
  domainName: string;
  keySelector: string;
  privateKey: string;
  headerFieldNames: string;
  skipFields: string;
};

/**
 * Resolves the recipient domain to one outbound SMTP target using MX first, then A/AAAA fallback.
 */
export async function resolveRelayOutboundTarget(
  args: {
    rcptTo: string;
    resolveMxFn?: RelayResolveMxFn;
    resolve4Fn?: RelayResolveAddressFn;
    resolve6Fn?: RelayResolveAddressFn;
  },
): Promise<RelayOutboundTarget> {
  const recipientDomain = readRecipientDomain({
    rcptTo: args.rcptTo,
  });
  const resolveMxFn = args.resolveMxFn ?? resolveMx;
  const resolve4Fn = args.resolve4Fn ?? resolve4;
  const resolve6Fn = args.resolve6Fn ?? resolve6;
  const mxRecords = await resolveMxFn(recipientDomain).catch(() => []);
  if (mxRecords.length > 0) {
    const selectedMx = [...mxRecords].sort((left, right) => left.priority - right.priority)[0];
    return {
      host: stripTrailingDot({
        value: selectedMx.exchange,
      }),
      port: 25,
    };
  }

  const ipv4Records = await resolve4Fn(recipientDomain).catch(() => []);
  const ipv6Records = await resolve6Fn(recipientDomain).catch(() => []);
  if (ipv4Records.length > 0 || ipv6Records.length > 0) {
    return {
      host: recipientDomain,
      port: 25,
    };
  }

  throw new Error(`No MX or A/AAAA records found for recipient domain ${recipientDomain}.`);
}

/**
 * Sends one assembled relay outbound MIME payload through SMTP with retry behavior.
 */
export async function sendRelayOutboundMime(
  args: {
    delivery: RelayCompletedOutboundDelivery;
    dkim?: RelayDkimSigningConfig;
    retryPolicy?: RelayOutboundRetryPolicy;
    sendMailFn?: RelayOutboundSendMailFn;
    onAttemptError?: (
      args: {
        attempt: number;
        message: string;
      },
    ) => void;
  },
): Promise<{
  attemptCount: number;
  messageId: string | null;
}> {
  const retryPolicy = args.retryPolicy ?? {
    maxAttempts: 3,
    baseDelayMs: 200,
  };

  let attempt = 0;
  while (attempt < retryPolicy.maxAttempts) {
    attempt += 1;
    try {
      const sendMailFn = args.sendMailFn ?? sendRelayOutboundViaMx;
      const info = await sendMailFn({
        delivery: args.delivery,
        dkim: args.dkim,
      });
      return {
        attemptCount: attempt,
        messageId: info.messageId ?? null,
      };
    } catch (error) {
      args.onAttemptError?.({
        attempt,
        message: (error as Error).message,
      });
      if (attempt >= retryPolicy.maxAttempts) {
        throw error;
      }

      await delay({
        ms: retryPolicy.baseDelayMs * (2 ** (attempt - 1)),
      });
    }
  }

  throw new Error('Relay outbound delivery exhausted retry loop without completion.');
}

/**
 * Builds one unique stream key from socket identity and tunnel stream id.
 */
export function toRelayStreamKey(
  args: {
    socketId: string;
    streamId: string;
  },
): string {
  return `${args.socketId}:${args.streamId}`;
}

/**
 * Waits one fixed duration before retry continuation.
 */
export function delay(
  args: {
    ms: number;
  },
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, args.ms);
  });
}

/**
 * Sends one outbound MIME payload directly to recipient-domain MX over SMTP.
 */
export async function sendRelayOutboundViaMx(
  args: {
    delivery: RelayCompletedOutboundDelivery;
    dkim?: RelayDkimSigningConfig;
    resolveOutboundTargetFn?: typeof resolveRelayOutboundTarget;
    createTransportFn?: (
      options: TransportOptions,
    ) => RelayOutboundTransport;
  },
): Promise<RelayOutboundSendMailResult> {
  const resolveOutboundTargetFn = args.resolveOutboundTargetFn ?? resolveRelayOutboundTarget;
  const createTransportFn = args.createTransportFn ?? createTransport;
  const target = await resolveOutboundTargetFn({
    rcptTo: args.delivery.rcptTo,
  });
  const transport = createTransportFn({
    host: target.host,
    port: target.port,
    secure: false,
    ...(args.dkim?.enabled ? {
      dkim: {
        domainName: args.dkim.domainName,
        keySelector: args.dkim.keySelector,
        privateKey: args.dkim.privateKey,
        headerFieldNames: args.dkim.headerFieldNames,
        skipFields: args.dkim.skipFields,
      },
    } : {}),
  } as TransportOptions);
  try {
    const info = await transport.sendMail({
      envelope: {
        from: args.delivery.mailFrom,
        to: [args.delivery.rcptTo],
      },
      raw: args.delivery.rawMimeBuffer,
    });
    return {
      messageId: info.messageId,
    };
  } finally {
    if (typeof transport.close === 'function') {
      transport.close();
    }
  }
}

/**
 * Reads one recipient domain from a fully qualified email address.
 */
export function readRecipientDomain(
  args: {
    rcptTo: string;
  },
): string {
  const parts = args.rcptTo.split('@');
  if (parts.length !== 2 || parts[1].trim().length === 0) {
    throw new Error(`Invalid relay recipient address: ${args.rcptTo}`);
  }

  return parts[1].trim().toLowerCase();
}

/**
 * Removes one optional trailing dot used by DNS FQDN record values.
 */
export function stripTrailingDot(
  args: {
    value: string;
  },
): string {
  return args.value.endsWith('.') ? args.value.slice(0, -1) : args.value;
}
