import type {
  GatewayTransportConfig,
  InboundNormalizedMessage,
  OutboundReplyRequest,
} from '@engine/gateway/types';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { handleInboundData, startInboundServer } from '@engine/gateway/inbound';
import { sendGatewayReply, sendGatewayReplyViaRelay } from '@engine/gateway/outbound';
import { applyRelayTunnelFrame, createRelayTunnelAssemblyState } from '@engine/gateway/relay-tunnel';
import { startRelayClient } from '@engine/gateway/relay-client';
import type { RelayClientController } from '@engine/gateway/relay-client';
import { buildReplySubject } from '@engine/gateway/threading';
import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createUnifiedLogger } from '@engine/shared/logger';
import {
  extractEmailLocalPart,
  listPersonas,
  resolvePersonaConfigDirPath,
  resolveDefaultPersonaRoots,
  resolvePersonaByEmailLocalPart,
  resolvePersonaMemoryPaths,
} from '@engine/shared/personas';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

import { createOutboundTransport } from './outbound';
import type { AttachmentLimits } from './inbound';

/**
 * Represents one gateway runtime mode.
 */
export type GatewayMode = 'dev' | 'default';

/**
 * Represents one gateway runtime configuration.
 */
export type GatewayRuntimeConfig = {
  mode: GatewayMode;
  host: string;
  port: number;
  attachmentLimits?: Partial<AttachmentLimits>;
  transport?: GatewayTransportConfig;
  relay?: GatewayRelayClientRuntimeConfig;
  defaultFromAddress: string;
};

/**
 * Represents optional relay-client runtime config used by gateway relay mode.
 */
export type GatewayRelayClientRuntimeConfig = {
  enabled: boolean;
  relayWsUrl: string;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  heartbeatTimeoutMs: number;
};

/**
 * Resolves one persona id from SMTP envelope recipient local-part addressing.
 */
export function resolvePersonaIdFromSession(
  args: {
    recipientAddress?: string;
  },
): string | undefined {
  if (!args.recipientAddress) {
    return undefined;
  }

  const emailLocalPart = extractEmailLocalPart({ emailAddress: args.recipientAddress });
  const persona = resolvePersonaByEmailLocalPart({
    emailLocalPart,
    roots: resolveDefaultPersonaRoots(),
  });
  return persona?.personaId;
}

/**
 * Resolves per-persona gateway log and attachment directories.
 */
export function resolveGatewayPersonaPaths(
  args: {
    personaId: string;
  },
): {
  logsDirPath: string;
  attachmentsDirPath: string;
} {
  const paths = resolvePersonaMemoryPaths({
    personaId: args.personaId,
    roots: resolveDefaultPersonaRoots(),
  });
  return {
    logsDirPath: paths.logsDirPath,
    attachmentsDirPath: paths.attachmentsDirPath,
  };
}

/**
 * Starts gateway runtime and wires inbound messages to harness inference behavior.
 */
export async function startGatewayRuntime(
  args: {
    config: GatewayRuntimeConfig;
  },
): Promise<void> {
  const globalConfig = readGlobalRuntimeConfig();
  const logger = createUnifiedLogger({
    logsDirPath: globalConfig.logsDirPath,
    scope: 'gateway',
    consoleLogFormat: globalConfig.consoleLogFormat,
  });
  const transport = args.config.transport
    ? createOutboundTransport({ config: args.config.transport })
    : undefined;
  const inboundConfig = createGatewayInboundProcessingConfig({
    runtimeConfig: args.config,
    logger,
    transport,
  });
  const relayClientsByPersonaId = startGatewayRelayClients({
    relayConfig: args.config.relay,
    logger,
    onRelayInboundMime: (relayInboundArgs): void => {
      void ingestRelayInboundMime({
        inboundConfig,
        recipientAddress: relayInboundArgs.recipientAddress,
        mailFrom: relayInboundArgs.mailFrom,
        rawMimeBuffer: relayInboundArgs.rawMimeBuffer,
      }).catch((error: Error) => {
        logger.error({
          event: 'gateway.relay.ingest_failed',
          context: {
            message: error.message,
            recipientAddress: relayInboundArgs.recipientAddress,
          },
        });
      });
    },
  });
  if (relayClientsByPersonaId.size > 0) {
    logger.info({
      event: 'gateway.relay.clients_started',
      context: {
        relayClientCount: relayClientsByPersonaId.size,
      },
    });
  }
  inboundConfig.relayClientsByPersonaId = relayClientsByPersonaId;

  await startInboundServer({
    config: inboundConfig,
  });
}

/**
 * Creates one shared inbound-processing config used by direct SMTP and relay-ingested MIME flows.
 */
export function createGatewayInboundProcessingConfig(
  args: {
    runtimeConfig: GatewayRuntimeConfig;
    logger: ReturnType<typeof createUnifiedLogger>;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
  },
): {
  host: string;
  port: number;
  dev: boolean;
  requirePersonaRouting: true;
  attachmentLimits?: Partial<AttachmentLimits>;
  resolvePersonaId: (
    args: {
      session: SMTPServerSession;
    },
  ) => string | undefined;
  resolvePersonaPaths: (
    args: {
      personaId: string;
    },
  ) => {
    logsDirPath: string;
    attachmentsDirPath: string;
  };
  logger: ReturnType<typeof createUnifiedLogger>;
  relayClientsByPersonaId?: Map<string, RelayClientController>;
  onMessage: (
    args: {
      message: InboundNormalizedMessage;
    },
  ) => Promise<void>;
} {
  return {
    host: args.runtimeConfig.host,
    port: args.runtimeConfig.port,
    dev: args.runtimeConfig.mode === 'dev',
    requirePersonaRouting: true,
    attachmentLimits: args.runtimeConfig.attachmentLimits,
    resolvePersonaId: ({ session }): string | undefined => resolvePersonaIdFromSession({
      recipientAddress: session.envelope?.rcptTo?.[0]?.address,
    }),
    resolvePersonaPaths: ({ personaId }) => resolveGatewayPersonaPaths({ personaId }),
    logger: args.logger,
    relayClientsByPersonaId: undefined,
    onMessage: async ({ message }): Promise<void> => {
      args.logger.info({
        event: 'gateway.inbound.received',
        context: {
          personaId: message.personaId ?? null,
          threadId: message.threadId,
          messageId: message.messageId,
        },
      });
      persistInboundMessageForRuntime({
        message,
        logger: args.logger,
      });
      enqueueInboundProcessing({
        logger: args.logger,
        message,
        transport: args.transport,
        relayClientsByPersonaId: args.relayClientsByPersonaId,
        defaultFromAddress: args.runtimeConfig.defaultFromAddress,
      });
    },
  };
}

/**
 * Starts one relay client per known persona when relay mode is enabled.
 */
export function startGatewayRelayClients(
  args: {
    relayConfig?: GatewayRelayClientRuntimeConfig;
    logger: {
      info: (args: { event: string; context: Record<string, unknown> }) => void;
      error: (args: { event: string; context: Record<string, unknown> }) => void;
    };
    onRelayInboundMime?: (
      args: {
        recipientAddress: string;
        mailFrom: string;
        rawMimeBuffer: Buffer;
      },
    ) => void;
    startClient?: typeof startRelayClient;
  },
): Map<string, RelayClientController> {
  const relayClientsByPersonaId = new Map<string, RelayClientController>();
  if (!args.relayConfig?.enabled) {
    return relayClientsByPersonaId;
  }

  const personas = listPersonas({
    roots: resolveDefaultPersonaRoots(),
  });
  const startClient = args.startClient ?? startRelayClient;
  for (const persona of personas) {
    const relayAssemblyState = createRelayTunnelAssemblyState();
    const passportKeyPem = readPersonaPassportKeyPem({
      personaId: persona.personaId,
    });
    const controller = startClient({
      config: {
        relayWsUrl: args.relayConfig.relayWsUrl,
        publicKeyBase32: persona.publicKeyBase32,
        privateKeyPem: passportKeyPem,
        reconnectBaseDelayMs: args.relayConfig.reconnectBaseDelayMs,
        reconnectMaxDelayMs: args.relayConfig.reconnectMaxDelayMs,
        heartbeatTimeoutMs: args.relayConfig.heartbeatTimeoutMs,
      },
      callbacks: {
        onAuthenticated: (): void => {
          args.logger.info({
            event: 'gateway.relay.authenticated',
            context: {
              personaId: persona.personaId,
              publicKeyBase32: persona.publicKeyBase32,
            },
          });
        },
        onDisconnected: (disconnectArgs): void => {
          args.logger.error({
            event: 'gateway.relay.disconnected',
            context: {
              personaId: persona.personaId,
              reconnectAttempt: disconnectArgs.reconnectAttempt,
              reconnectDelayMs: disconnectArgs.reconnectDelayMs,
            },
          });
        },
        onBinaryMessage: (messageArgs): void => {
          const frame = parseRelayTunnelFrame({
            payload: messageArgs.payload,
          });
          if (!frame) {
            args.logger.error({
              event: 'gateway.relay.frame_invalid',
              context: {
                personaId: persona.personaId,
                bytes: messageArgs.payload.length,
              },
            });
            return;
          }

          applyRelayTunnelFrame({
            state: relayAssemblyState,
            frame,
            onCompleted: (completedArgs): void => {
              args.onRelayInboundMime?.({
                recipientAddress: completedArgs.rcptTo,
                mailFrom: completedArgs.mailFrom,
                rawMimeBuffer: completedArgs.rawMimeBuffer,
              });
            },
          });
        },
      },
    });
    relayClientsByPersonaId.set(persona.personaId, controller);
  }

  return relayClientsByPersonaId;
}

/**
 * Ingests one relay-delivered raw MIME payload through the shared gateway inbound processor.
 */
export async function ingestRelayInboundMime(
  args: {
    inboundConfig: {
      resolvePersonaId: (
        args: {
          session: SMTPServerSession;
        },
      ) => string | undefined;
      resolvePersonaPaths: (
        args: {
          personaId: string;
        },
      ) => {
        logsDirPath: string;
        attachmentsDirPath: string;
      };
      logger: ReturnType<typeof createUnifiedLogger>;
      onMessage: (
        args: {
          message: InboundNormalizedMessage;
        },
      ) => Promise<void>;
      requirePersonaRouting: true;
      attachmentLimits?: Partial<AttachmentLimits>;
      host: string;
      port: number;
      dev: boolean;
    };
    recipientAddress: string;
    mailFrom: string;
    rawMimeBuffer: Buffer;
  },
): Promise<void> {
  const stream = Readable.from([args.rawMimeBuffer]) as SMTPServerDataStream;
  const session = {
    id: `relay-${Date.now().toString(36)}`,
    envelope: {
      mailFrom: {
        address: args.mailFrom,
        args: false,
      },
      rcptTo: [
        {
          address: args.recipientAddress,
          args: false,
        },
      ],
    },
  } as unknown as SMTPServerSession;

  await handleInboundData({
    stream,
    session,
    config: args.inboundConfig,
  });
}

/**
 * Reads one persona passport private key PEM from persona config namespace.
 */
export function readPersonaPassportKeyPem(
  args: {
    personaId: string;
  },
): string {
  const configDirPath = resolvePersonaConfigDirPath({
    personaId: args.personaId,
    roots: resolveDefaultPersonaRoots(),
  });
  return readFileSync(join(configDirPath, 'passport.key'), 'utf8');
}

/**
 * Enqueues async inbound processing after message persistence is complete.
 */
export function enqueueInboundProcessing(
  args: {
    logger: ReturnType<typeof createGatewayLogger>;
    message: InboundNormalizedMessage;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    defaultFromAddress: string;
  },
): void {
  args.logger.info({
    event: 'gateway.inbound.enqueued',
    context: {
      personaId: args.message.personaId ?? null,
      threadId: args.message.threadId,
      messageId: args.message.messageId,
    },
  });

  queueMicrotask(() => {
    void handleInboundForRuntime({
      logger: args.logger,
      message: args.message,
      transport: args.transport,
      relayClientsByPersonaId: args.relayClientsByPersonaId,
      defaultFromAddress: args.defaultFromAddress,
    }).catch((error: Error) => {
      args.logger.error({
        event: 'gateway.error',
        context: {
          message: error.message,
          personaId: args.message.personaId ?? null,
          threadId: args.message.threadId,
          messageId: args.message.messageId,
        },
      });
    });
  });
}

/**
 * Handles one inbound message by running async harness inference and tool-driven actions.
 */
export async function handleInboundForRuntime(
  args: {
    logger: ReturnType<typeof createGatewayLogger>;
    message: InboundNormalizedMessage;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    defaultFromAddress: string;
  },
): Promise<void> {
  await runHarnessForPersistedInboundMessage({
    message: args.message,
    defaultFromAddress: args.defaultFromAddress,
    invokeRuntimeAction: createGatewayRuntimeActionInvoker({
      message: args.message,
      logger: args.logger,
      transport: args.transport,
      relayClientsByPersonaId: args.relayClientsByPersonaId,
      defaultFromAddress: args.defaultFromAddress,
    }),
    logger: args.logger,
  });
}

/**
 * Creates one runtime action invoker for harness tool side effects.
 */
export function createGatewayRuntimeActionInvoker(
  args: {
    message: InboundNormalizedMessage;
    logger: ReturnType<typeof createGatewayLogger>;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    defaultFromAddress: string;
  },
): (
  runtimeArgs: {
    action: string;
    payload: Record<string, unknown>;
  },
) => Promise<Record<string, unknown>> {
  return async (
    runtimeArgs: {
      action: string;
      payload: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> => {
    if (runtimeArgs.action !== 'email.send') {
      throw new Error(`Unsupported runtime action: ${runtimeArgs.action}`);
    }
    const request = buildEmailSendRequestFromAction({
      message: args.message,
      payload: runtimeArgs.payload,
      defaultFromAddress: args.defaultFromAddress,
    });
    let messageId: string | null = null;
    if (args.transport) {
      const info = await sendGatewayReply({
        transport: args.transport,
        logger: args.logger,
        request,
      });
      messageId = info.messageId ?? null;
    } else if (args.message.personaId && args.relayClientsByPersonaId?.has(args.message.personaId)) {
      const relayClient = args.relayClientsByPersonaId.get(args.message.personaId);
      if (!relayClient) {
        throw new Error('Relay client lookup failed for outbound email.send.');
      }

      const relayInfo = await sendGatewayReplyViaRelay({
        relayClient,
        logger: args.logger,
        request,
      });
      messageId = relayInfo.messageId;
    } else {
      throw new Error('Outbound transport is not configured for email.send.');
    }

    return {
      messageId,
    };
  };
}

/**
 * Builds one outbound reply request from a runtime email.send action payload.
 */
export function buildEmailSendRequestFromAction(
  args: {
    message: InboundNormalizedMessage;
    payload: Record<string, unknown>;
    defaultFromAddress: string;
  },
): OutboundReplyRequest {
  const to = Array.isArray(args.payload.to)
    ? args.payload.to.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  if (to.length === 0) {
    throw new Error('email.send requires non-empty payload.to recipients.');
  }
  if (to.some((address) => !isEmailAddress({ value: address }))) {
    throw new Error('email.send requires payload.to recipients to be valid email addresses.');
  }

  const payloadSubject = typeof args.payload.subject === 'string'
    ? args.payload.subject
    : '';
  if (payloadSubject.trim().length === 0) {
    throw new Error('email.send requires non-empty payload.subject.');
  }

  const text = typeof args.payload.text === 'string'
    ? args.payload.text
    : '';
  if (text.trim().length === 0) {
    throw new Error('email.send requires non-empty payload.text.');
  }

  const inReplyTo = typeof args.payload.inReplyTo === 'string'
    ? args.payload.inReplyTo
    : args.message.messageId;
  const subject = resolveReplySubject({
    message: args.message,
    inReplyTo,
    payloadSubject,
  });
  const fromAddress = resolveReplyFromAddress({
    message: args.message,
    defaultFromAddress: args.defaultFromAddress,
  });

  return {
    to: to.map((address) => ({ address })),
    from: {
      address: fromAddress,
    },
    cc: toAddresses({ value: args.payload.cc }),
    bcc: toAddresses({ value: args.payload.bcc }),
    subject,
    text,
    html: typeof args.payload.html === 'string'
      ? args.payload.html
      : undefined,
    inReplyTo,
    references: toStringArray({ value: args.payload.references }) ?? args.message.references,
    headers: toStringRecord({ value: args.payload.headers }),
  };
}

/**
 * Resolves reply sender address using inbound persona destination as canonical identity.
 */
export function resolveReplyFromAddress(
  args: {
    message: InboundNormalizedMessage;
    defaultFromAddress: string;
  },
): string {
  return args.message.envelopeRcptTo[0]?.address
    ?? args.message.to[0]?.address
    ?? args.defaultFromAddress;
}

/**
 * Resolves reply subject for threaded replies while preserving explicit new-thread subjects.
 */
export function resolveReplySubject(
  args: {
    message: InboundNormalizedMessage;
    inReplyTo: string;
    payloadSubject: string;
  },
): string {
  if (args.inReplyTo === args.message.messageId) {
    return buildReplySubject({ subject: args.message.subject });
  }

  return args.payloadSubject;
}

/**
 * Returns true when one string resembles an email address.
 */
export function isEmailAddress(
  args: {
    value: string;
  },
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.value);
}

/**
 * Converts unknown payload values into optional string arrays.
 */
export function toStringArray(
  args: {
    value: unknown;
  },
): string[] | undefined {
  if (!Array.isArray(args.value)) {
    return undefined;
  }

  const values = args.value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return values.length > 0 ? values : undefined;
}

/**
 * Converts unknown array payload values to optional mail-address objects.
 */
export function toAddresses(
  args: {
    value: unknown;
  },
): Array<{ address: string }> | undefined {
  const values = toStringArray({
    value: args.value,
  });
  return values?.map((address) => ({ address }));
}

/**
 * Converts unknown payload header objects into optional string records.
 */
export function toStringRecord(
  args: {
    value: unknown;
  },
): Record<string, string> | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      output[key] = value;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

/**
 * Creates a minimal structured gateway logger.
 */
export function createGatewayLogger(): {
  info: (args: { event: string; context: Record<string, unknown> }) => void;
  error: (args: { event: string; context: Record<string, unknown> }) => void;
} {
  return {
    info: ({ event, context }): void => {
      process.stdout.write(`${JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        status: 'ok',
        ...context,
      })}\n`);
    },
    error: ({ event, context }): void => {
      process.stderr.write(`${JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        status: 'error',
        ...context,
      })}\n`);
    },
  };
}

/**
 * Reads and validates gateway runtime config from disk.
 */
export function readGatewayRuntimeConfig(
  args: {
    configPath: string;
  },
): GatewayRuntimeConfig {
  if (!existsSync(args.configPath)) {
    throw new Error(`Gateway config not found at ${args.configPath}`);
  }

  const text = readFileSync(args.configPath, 'utf8');
  const parsed = JSON.parse(text) as GatewayRuntimeConfig;

  return parsed;
}

/**
 * Resolves the default gateway config path within the workspace.
 */
export function resolveDefaultGatewayConfigPath(): string {
  return join(process.cwd(), 'config', 'gateway.json');
}
