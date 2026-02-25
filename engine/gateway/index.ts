import type {
  GatewayTransportConfig,
  GatewayLogger,
  InboundNormalizedMessage,
  OutboundReplyRequest,
} from '@engine/gateway/types';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';

import { handleInboundData, startInboundServer } from '@engine/gateway/inbound';
import { sendGatewayReply, sendGatewayReplyViaRelay } from '@engine/gateway/outbound';
import { applyRelayTunnelFrame, createRelayTunnelAssemblyState } from '@engine/gateway/relay-tunnel';
import { startRelayClient } from '@engine/gateway/relay-client';
import type { RelayClientController } from '@engine/gateway/relay-client';
import { buildReplySubject } from '@engine/gateway/threading';
import type { HarnessRuntimeActionInvoker } from '@engine/harness/runtime';
import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { startSchedulerRuntime } from '@engine/scheduler/runtime';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createUnifiedLogger } from '@engine/shared/logger';
import {
  isValidEmailAddress,
  readEmailAddressDomain,
} from '@engine/shared/email';
import {
  extractEmailLocalPart,
  listPersonas,
  readPersonaMetadata,
  resolvePersonaConfigDirPath,
  resolveDefaultPersonaRoots,
  resolvePersonaByEmailLocalPart,
  resolvePersonaMemoryPaths,
  updatePersonaEmailAddress,
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
  mailDomain: string;
  attachmentLimits?: Partial<AttachmentLimits>;
  transport?: GatewayTransportConfig;
  relay?: GatewayRelayClientRuntimeConfig;
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
  if (args.config.relay?.enabled) {
    reconcilePersonaMailboxDomains({
      mailDomain: args.config.mailDomain,
      logger,
    });
  }
  let inboundConfig: ReturnType<typeof createGatewayInboundProcessingConfig> | undefined;
  const relayClientsByPersonaId = startGatewayRelayClients({
    relayConfig: args.config.relay,
    logger,
    onRelayInboundMime: (relayInboundArgs): void => {
      if (!inboundConfig) {
        logger.error({
          event: 'gateway.relay.ingest_uninitialized',
          context: {
            recipientAddress: relayInboundArgs.recipientAddress,
          },
        });
        return;
      }

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
  inboundConfig = createGatewayInboundProcessingConfig({
    runtimeConfig: args.config,
    logger,
    transport,
    relayClientsByPersonaId,
    adminContactEmail: globalConfig.adminContactEmail,
  });
  if (relayClientsByPersonaId.size > 0) {
    logger.info({
      event: 'gateway.relay.clients_started',
      context: {
        relayClientCount: relayClientsByPersonaId.size,
      },
    });
  }
  try {
    const schedulerController = startSchedulerRuntime({
      config: {},
      dependencies: {
        logger,
        transport,
        relayClientsByPersonaId,
      },
    });
    void schedulerController;
  } catch (error) {
    logger.error({
      event: 'gateway.scheduler.start_failed',
      context: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  await startInboundServer({
    config: inboundConfig,
  });
}

/**
 * Reconciles persona mailbox domains to configured gateway mail domain for relay-mode deliverability.
 */
export function reconcilePersonaMailboxDomains(
  args: {
    mailDomain: string;
    logger?: {
      info: (args: { event: string; context: Record<string, unknown> }) => void;
    };
  },
): number {
  const personas = listPersonas({
    roots: resolveDefaultPersonaRoots(),
  });
  let updatedCount = 0;
  for (const persona of personas) {
    const domain = readEmailDomain({
      emailAddress: persona.emailAddress,
    });
    if (domain === args.mailDomain) {
      continue;
    }

    updatePersonaEmailAddress({
      personaId: persona.personaId,
      emailAddress: `${persona.emailLocalPart}@${args.mailDomain}`,
      roots: resolveDefaultPersonaRoots(),
    });
    updatedCount += 1;
    args.logger?.info({
      event: 'gateway.persona.email_domain_reconciled',
      context: {
        personaId: persona.personaId,
        previousEmailAddress: persona.emailAddress,
        reconciledEmailAddress: `${persona.emailLocalPart}@${args.mailDomain}`,
      },
    });
  }

  return updatedCount;
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
    adminContactEmail?: string;
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
    relayClientsByPersonaId: args.relayClientsByPersonaId,
    onMessage: async ({ message }): Promise<void> => {
      const correlationId = buildGatewayCorrelationId({
        message,
      });
      args.logger.info({
        event: 'gateway.inbound.received',
        context: {
          correlationId,
          personaId: message.personaId ?? null,
          threadId: message.threadId,
          messageId: message.messageId,
        },
      });
      persistInboundMessageForRuntime({
        message,
        logger: args.logger,
        correlationId,
      });
      enqueueInboundProcessing({
        logger: args.logger,
        message,
        transport: args.transport,
        relayClientsByPersonaId: args.relayClientsByPersonaId,
        mailDomain: args.runtimeConfig.mailDomain,
        adminContactEmail: args.adminContactEmail,
        correlationId,
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
    sessionRole?: 'inbound' | 'outbound';
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
    args.logger.info({
      event: 'gateway.relay.client_starting',
      context: {
        personaId: persona.personaId,
        publicKeyBase32: persona.publicKeyBase32,
      },
    });
    const relayAssemblyState = createRelayTunnelAssemblyState();
    const passportKeyPem = readPersonaPassportKeyPem({
      personaId: persona.personaId,
    });
    const controller = startClient({
      config: {
        relayWsUrl: args.relayConfig.relayWsUrl,
        publicKeyBase32: persona.publicKeyBase32,
        privateKeyPem: passportKeyPem,
        sessionRole: args.sessionRole ?? 'inbound',
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
        onControlMessage: (controlArgs): void => {
          const type = typeof controlArgs.payload.type === 'string'
            ? controlArgs.payload.type
            : 'unknown';
          args.logger.info({
            event: 'gateway.relay.control_message',
            context: {
              personaId: persona.personaId,
              type,
              code: typeof controlArgs.payload.code === 'string'
                ? controlArgs.payload.code
                : null,
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
    mailDomain: string;
    adminContactEmail?: string;
    correlationId?: string;
  },
): void {
  args.logger.info({
    event: 'gateway.inbound.enqueued',
    context: {
      correlationId: args.correlationId ?? null,
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
      mailDomain: args.mailDomain,
      correlationId: args.correlationId,
    }).catch(async (error: Error) => {
      args.logger.error({
        event: 'gateway.error',
        context: {
          correlationId: args.correlationId ?? null,
          message: error.message,
          personaId: args.message.personaId ?? null,
          threadId: args.message.threadId,
          messageId: args.message.messageId,
        },
      });
      await sendGatewayFailureAlert({
        logger: args.logger,
        message: args.message,
        errorMessage: error.message,
        transport: args.transport,
        relayClientsByPersonaId: args.relayClientsByPersonaId,
        adminContactEmail: args.adminContactEmail,
        correlationId: args.correlationId,
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
    mailDomain: string;
    correlationId?: string;
  },
): Promise<void> {
  const personaSenderAddress = resolvePersonaSenderAddress({
    message: args.message,
  });
  await runHarnessForPersistedInboundMessage({
    message: args.message,
    senderAddress: personaSenderAddress,
    invokeRuntimeAction: createGatewayRuntimeActionInvoker({
      message: args.message,
      personaSenderAddress,
      logger: args.logger,
      transport: args.transport,
      relayClientsByPersonaId: args.relayClientsByPersonaId,
      correlationId: args.correlationId,
    }),
    logger: args.logger,
    correlationId: args.correlationId,
  });
}

/**
 * Creates one runtime action invoker for harness tool side effects.
 */
export function createGatewayRuntimeActionInvoker(
  args: {
    message: InboundNormalizedMessage;
    personaSenderAddress?: string;
    logger: ReturnType<typeof createGatewayLogger>;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    correlationId?: string;
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
    args.logger.info({
      event: 'gateway.runtime_action.invoking',
      context: {
        correlationId: args.correlationId ?? null,
        action: runtimeArgs.action,
      },
    });
    if (runtimeArgs.action === 'file.read') {
      return runReadFileRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'file.write') {
      return runWriteFileRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'file.edit') {
      return runEditFileRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'file.glob') {
      return runGlobRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'file.search') {
      return runSearchRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action !== 'email.send') {
      throw new Error(`Unsupported runtime action: ${runtimeArgs.action}`);
    }
    const request = buildEmailSendRequestFromAction({
      message: args.message,
      personaSenderAddress: args.personaSenderAddress
        ?? resolvePersonaSenderAddress({ message: args.message }),
      payload: runtimeArgs.payload,
    });
    let messageId: string | null = null;
    if (args.transport) {
      const info = await sendGatewayReply({
        transport: args.transport,
        logger: args.logger,
        request,
        correlationId: args.correlationId,
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
        correlationId: args.correlationId,
      });
      messageId = relayInfo.messageId;
    } else {
      throw new Error('Outbound transport is not configured for email.send.');
    }

    args.logger.info({
      event: 'gateway.runtime_action.completed',
      context: {
        correlationId: args.correlationId ?? null,
        action: runtimeArgs.action,
        messageId,
      },
    });
    return {
      messageId,
    };
  };
}

/**
 * Runs one file.read runtime action and returns full text content.
 */
export function runReadFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.read',
  });
  const content = readFileSync(targetPath, 'utf8');
  return {
    path: targetPath,
    content,
  };
}

/**
 * Runs one file.write runtime action and creates parent directories as needed.
 */
export function runWriteFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.write',
  });
  const content = readRuntimeStringValue({
    payload: args.payload,
    fieldName: 'content',
    actionName: 'file.write',
  });
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
  return {
    path: targetPath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
  };
}

/**
 * Runs one file.edit runtime action using literal replacement semantics.
 */
export function runEditFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.edit',
  });
  const oldText = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'oldText',
    actionName: 'file.edit',
  });
  if (oldText.length === 0) {
    throw new Error('file.edit payload.oldText must not be empty.');
  }
  const newText = readRuntimeStringValue({
    payload: args.payload,
    fieldName: 'newText',
    actionName: 'file.edit',
  });
  const replaceAll = readOptionalRuntimeBoolean({
    payload: args.payload,
    fieldName: 'replaceAll',
    actionName: 'file.edit',
  }) ?? false;

  const original = readFileSync(targetPath, 'utf8');
  const matchCount = original.split(oldText).length - 1;
  if (matchCount <= 0) {
    throw new Error('file.edit could not find payload.oldText in target file.');
  }

  const next = replaceAll
    ? original.split(oldText).join(newText)
    : original.replace(oldText, newText);
  writeFileSync(targetPath, next, 'utf8');
  return {
    path: targetPath,
    appliedEdits: replaceAll ? matchCount : 1,
  };
}

/**
 * Runs one file.glob runtime action and returns matching workspace-relative paths.
 */
export function runGlobRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    execFileSyncFn?: typeof execFileSync;
  },
): Record<string, unknown> {
  const pattern = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'pattern',
    actionName: 'file.glob',
  });
  const targetCwd = args.payload.cwd === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'cwd',
      actionName: 'file.glob',
    });
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'file.glob',
  }) ?? 100;
  const output = runRipgrepCommand({
    args: ['--files', '-g', pattern],
    cwd: targetCwd,
    execFileSyncFn: args.execFileSyncFn,
    actionName: 'file.glob',
  });
  const workspaceRoot = process.cwd();
  const paths = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => relative(workspaceRoot, resolve(targetCwd, line)));
  const limitedPaths = paths.slice(0, maxResults);
  return {
    paths: limitedPaths,
    truncated: paths.length > limitedPaths.length,
    totalMatches: paths.length,
  };
}

/**
 * Runs one file.search runtime action and returns line/column matches.
 */
export function runSearchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    execFileSyncFn?: typeof execFileSync;
  },
): Record<string, unknown> {
  const query = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'query',
    actionName: 'file.search',
  });
  const searchRoot = args.payload.path === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'path',
      actionName: 'file.search',
    });
  const isRegex = readOptionalRuntimeBoolean({
    payload: args.payload,
    fieldName: 'isRegex',
    actionName: 'file.search',
  }) ?? false;
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'file.search',
  }) ?? 200;
  const ripgrepArgs = [
    '-n',
    '--column',
    '--no-heading',
    ...(isRegex ? [] : ['--fixed-strings']),
    query,
    '.',
  ];
  const output = runRipgrepCommand({
    args: ripgrepArgs,
    cwd: searchRoot,
    execFileSyncFn: args.execFileSyncFn,
    actionName: 'file.search',
    allowNoMatches: true,
  });
  const workspaceRoot = process.cwd();
  const matches = output
    .split('\n')
    .map((line) => parseRipgrepMatchLine({
      line,
      cwd: searchRoot,
      workspaceRoot,
    }))
    .filter((match): match is {
      path: string;
      line: number;
      column: number;
      preview: string;
    } => match !== undefined)
    .slice(0, maxResults);
  return {
    matches,
  };
}

/**
 * Runs one ripgrep command and returns UTF-8 stdout with actionable error mapping.
 */
export function runRipgrepCommand(
  args: {
    args: string[];
    cwd: string;
    actionName: string;
    allowNoMatches?: boolean;
    execFileSyncFn?: typeof execFileSync;
  },
): string {
  const execSync = args.execFileSyncFn ?? execFileSync;
  try {
    return execSync('rg', args.args, {
      cwd: args.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as string;
  } catch (error) {
    const errorRecord = error as {
      status?: number;
      stderr?: string | Buffer;
      message?: string;
    };
    const status = errorRecord.status ?? null;
    if (args.allowNoMatches && status === 1) {
      return '';
    }

    const stderr = typeof errorRecord.stderr === 'string'
      ? errorRecord.stderr
      : Buffer.isBuffer(errorRecord.stderr)
        ? errorRecord.stderr.toString('utf8')
        : '';
    throw new Error(`${args.actionName} failed: ${stderr.trim() || errorRecord.message || 'unknown error'}`);
  }
}

/**
 * Parses one ripgrep match line into structured path/line/column payload fields.
 */
export function parseRipgrepMatchLine(
  args: {
    line: string;
    cwd: string;
    workspaceRoot: string;
  },
): {
  path: string;
  line: number;
  column: number;
  preview: string;
} | undefined {
  const trimmed = args.line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = trimmed.match(/^(.*?):(\d+):(\d+):(.*)$/);
  if (!match) {
    return undefined;
  }

  const [, rawPath, rawLine, rawColumn, preview] = match;
  return {
    path: relative(args.workspaceRoot, resolve(args.cwd, rawPath)),
    line: Number(rawLine),
    column: Number(rawColumn),
    preview,
  };
}

/**
 * Reads one required runtime path and resolves it within workspace root.
 */
export function readRequiredRuntimePath(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const rawPath = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: args.fieldName,
    actionName: args.actionName,
  });
  return resolveWorkspacePath({
    inputPath: rawPath,
    actionName: args.actionName,
  });
}

/**
 * Reads one required non-empty runtime payload string.
 */
export function readRequiredRuntimeString(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const value = args.payload[args.fieldName];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${args.actionName} payload.${args.fieldName} is required.`);
  }

  return value;
}

/**
 * Reads one required runtime payload string and allows empty text content values.
 */
export function readRuntimeStringValue(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const value = args.payload[args.fieldName];
  if (typeof value !== 'string') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a string.`);
  }

  return value;
}

/**
 * Reads one optional boolean runtime payload value.
 */
export function readOptionalRuntimeBoolean(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): boolean | undefined {
  const value = args.payload[args.fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a boolean.`);
  }

  return value;
}

/**
 * Reads one optional positive integer runtime payload value.
 */
export function readOptionalRuntimePositiveInteger(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): number | undefined {
  const value = args.payload[args.fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a positive integer.`);
  }

  return value;
}

/**
 * Resolves one input path inside workspace root and blocks traversal outside it.
 */
export function resolveWorkspacePath(
  args: {
    inputPath: string;
    actionName: string;
  },
): string {
  const workspaceRoot = process.cwd();
  const resolvedPath = resolve(workspaceRoot, args.inputPath);
  const relativePath = relative(workspaceRoot, resolvedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${args.actionName} path resolves outside workspace root.`);
  }

  return resolvedPath;
}

/**
 * Sends one admin-facing failure alert email for terminal gateway inbound processing errors.
 */
export async function sendGatewayFailureAlert(
  args: {
    logger: GatewayLogger;
    message: InboundNormalizedMessage;
    errorMessage: string;
    adminContactEmail?: string;
    transport?: ReturnType<typeof createOutboundTransport>;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    correlationId?: string;
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
  },
): Promise<void> {
  if (!args.adminContactEmail) {
    args.logger.error({
      event: 'gateway.alert.skipped_missing_admin_contact',
      context: {
        correlationId: args.correlationId ?? null,
        personaId: args.message.personaId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
      },
    });
    return;
  }

  if (!args.message.personaId) {
    args.logger.error({
      event: 'gateway.alert.skipped_missing_persona',
      context: {
        correlationId: args.correlationId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
      },
    });
    return;
  }

  const invoker = args.invokeRuntimeAction ?? createGatewayRuntimeActionInvoker({
    message: args.message,
    logger: args.logger,
    transport: args.transport,
    relayClientsByPersonaId: args.relayClientsByPersonaId,
    correlationId: args.correlationId,
  });
  try {
    const result = await invoker({
      action: 'email.send',
      payload: {
        to: [args.adminContactEmail],
        subject: 'Protege Gateway Failure Alert',
        text: [
          'Protege gateway encountered a terminal inbound processing failure.',
          `personaId: ${args.message.personaId}`,
          `threadId: ${args.message.threadId}`,
          `messageId: ${args.message.messageId}`,
          `error: ${args.errorMessage}`,
        ].join('\n'),
      },
    });
    args.logger.info({
      event: 'gateway.alert.sent',
      context: {
        correlationId: args.correlationId ?? null,
        personaId: args.message.personaId,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
        alertMessageId: typeof result.messageId === 'string'
          ? result.messageId
          : null,
      },
    });
  } catch (error) {
    args.logger.error({
      event: 'gateway.alert.failed',
      context: {
        correlationId: args.correlationId ?? null,
        personaId: args.message.personaId,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Builds one outbound reply request from a runtime email.send action payload.
 */
export function buildEmailSendRequestFromAction(
  args: {
    message: InboundNormalizedMessage;
    personaSenderAddress: string;
    payload: Record<string, unknown>;
  },
): OutboundReplyRequest {
  const threadingMode = readEmailSendThreadingMode({
    value: args.payload.threadingMode,
  });
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

  const inReplyTo = threadingMode === 'new_thread'
    ? (typeof args.payload.inReplyTo === 'string' ? args.payload.inReplyTo : args.message.messageId)
    : args.message.messageId;
  const subject = resolveReplySubject({
    message: args.message,
    inReplyTo,
    payloadSubject,
  });
  const fromAddress = resolveReplyFromAddress({
    personaSenderAddress: args.personaSenderAddress,
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
    references: threadingMode === 'new_thread'
      ? (toStringArray({ value: args.payload.references }) ?? [])
      : args.message.references,
    headers: toStringRecord({ value: args.payload.headers }),
  };
}

/**
 * Reads email.send threading mode and defaults to reply_current behavior for deterministic threading.
 */
export function readEmailSendThreadingMode(
  args: {
    value: unknown;
  },
): 'reply_current' | 'new_thread' {
  if (args.value === undefined) {
    return 'reply_current';
  }
  if (args.value === 'reply_current' || args.value === 'new_thread') {
    return args.value;
  }

  throw new Error('email.send payload.threadingMode must be "reply_current" or "new_thread".');
}

/**
 * Resolves reply sender address using inbound persona destination as canonical identity.
 */
export function resolveReplyFromAddress(
  args: {
    personaSenderAddress: string;
  },
): string {
  if (!isEmailAddress({ value: args.personaSenderAddress })) {
    throw new Error('Unable to resolve persona sender address for email.send runtime action.');
  }

  return args.personaSenderAddress;
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
  return isValidEmailAddress({
    value: args.value,
    allowLocalhost: true,
  });
}

/**
 * Reads one domain from email address text.
 */
export function readEmailDomain(
  args: {
    emailAddress: string;
  },
): string {
  return readEmailAddressDomain({
    emailAddress: args.emailAddress,
  });
}

/**
 * Resolves canonical outbound sender identity from persona metadata.
 */
export function resolvePersonaSenderAddress(
  args: {
    message: InboundNormalizedMessage;
  },
): string {
  if (!args.message.personaId) {
    throw new Error('Unable to resolve persona sender address for email.send runtime action.');
  }

  const persona = readPersonaMetadata({
    personaId: args.message.personaId,
    roots: resolveDefaultPersonaRoots(),
  });
  if (!isEmailAddress({ value: persona.emailAddress })) {
    throw new Error('Unable to resolve persona sender address for email.send runtime action.');
  }

  return persona.emailAddress;
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
  const parsed = JSON.parse(text) as unknown;
  return validateGatewayRuntimeConfig({
    parsed,
    configPath: args.configPath,
  });
}

/**
 * Resolves the default gateway config path within the workspace.
 */
export function resolveDefaultGatewayConfigPath(): string {
  return join(process.cwd(), 'config', 'gateway.json');
}

/**
 * Builds one stable correlation id for inbound processing and follow-up logs.
 */
export function buildGatewayCorrelationId(
  args: {
    message: InboundNormalizedMessage;
  },
): string {
  const personaId = args.message.personaId ?? 'unknown';
  const threadId = args.message.threadId.replace(/[^a-zA-Z0-9_-]/g, '');
  const messageId = args.message.messageId.replace(/[^a-zA-Z0-9_@.-]/g, '');
  return `${personaId}:${threadId}:${messageId}`;
}

/**
 * Validates parsed gateway runtime config and returns normalized config.
 */
export function validateGatewayRuntimeConfig(
  args: {
    parsed: unknown;
    configPath: string;
  },
): GatewayRuntimeConfig {
  if (!isRecord({
    value: args.parsed,
  })) {
    throw new Error(`Gateway config at ${args.configPath} must be a JSON object.`);
  }
  const parsed = args.parsed as Record<string, unknown>;

  const mode = parsed.mode;
  if (mode !== 'dev' && mode !== 'default') {
    throw new Error(`Gateway config at ${args.configPath} must set mode to "dev" or "default".`);
  }
  const host = readNonEmptyString({
    value: parsed.host,
    fieldPath: 'host',
    configPath: args.configPath,
  });
  const port = readPort({
    value: parsed.port,
    fieldPath: 'port',
    configPath: args.configPath,
  });
  const mailDomain = readMailDomain({
    value: parsed.mailDomain,
    fieldPath: 'mailDomain',
    configPath: args.configPath,
  });

  const transport = validateGatewayTransportConfig({
    value: parsed.transport,
    configPath: args.configPath,
  });
  const relay = validateGatewayRelayConfig({
    value: parsed.relay,
    configPath: args.configPath,
  });
  if (relay?.enabled && mailDomain === 'localhost') {
    throw new Error(`Gateway config at ${args.configPath} field mailDomain must not be localhost when relay is enabled.`);
  }

  return {
    mode,
    host,
    port,
    mailDomain,
    transport,
    relay,
  };
}

/**
 * Reads and validates one gateway mail domain string.
 */
export function readMailDomain(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): string {
  const domain = readNonEmptyString({
    value: args.value,
    fieldPath: args.fieldPath,
    configPath: args.configPath,
  }).toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.startsWith('.') || domain.endsWith('.')) {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must be a valid domain.`);
  }

  return domain;
}

/**
 * Validates optional gateway transport config section.
 */
export function validateGatewayTransportConfig(
  args: {
    value: unknown;
    configPath: string;
  },
): GatewayTransportConfig | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (!isRecord({
    value: args.value,
  })) {
    throw new Error(`Gateway config at ${args.configPath} field transport must be an object.`);
  }
  const transport = args.value as Record<string, unknown>;

  const host = readNonEmptyString({
    value: transport.host,
    fieldPath: 'transport.host',
    configPath: args.configPath,
  });
  const port = readPort({
    value: transport.port,
    fieldPath: 'transport.port',
    configPath: args.configPath,
  });
  const secure = readBoolean({
    value: transport.secure,
    fieldPath: 'transport.secure',
    configPath: args.configPath,
  });
  let auth: GatewayTransportConfig['auth'];
  if (transport.auth !== undefined) {
    if (!isRecord({ value: transport.auth })) {
      throw new Error(`Gateway config at ${args.configPath} field transport.auth must be an object.`);
    }
    const authConfig = transport.auth as Record<string, unknown>;
    auth = {
      user: readNonEmptyString({
        value: authConfig.user,
        fieldPath: 'transport.auth.user',
        configPath: args.configPath,
      }),
      pass: readNonEmptyString({
        value: authConfig.pass,
        fieldPath: 'transport.auth.pass',
        configPath: args.configPath,
      }),
    };
  }

  return {
    host,
    port,
    secure,
    auth,
  };
}

/**
 * Validates optional gateway relay config section.
 */
export function validateGatewayRelayConfig(
  args: {
    value: unknown;
    configPath: string;
  },
): GatewayRelayClientRuntimeConfig | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (!isRecord({
    value: args.value,
  })) {
    throw new Error(`Gateway config at ${args.configPath} field relay must be an object.`);
  }
  const relay = args.value as Record<string, unknown>;

  const enabled = readBoolean({
    value: relay.enabled,
    fieldPath: 'relay.enabled',
    configPath: args.configPath,
  });
  const relayWsUrl = readNonEmptyString({
    value: relay.relayWsUrl,
    fieldPath: 'relay.relayWsUrl',
    configPath: args.configPath,
  });
  if (!relayWsUrl.startsWith('ws://') && !relayWsUrl.startsWith('wss://')) {
    throw new Error(`Gateway config at ${args.configPath} field relay.relayWsUrl must start with ws:// or wss://.`);
  }

  return {
    enabled,
    relayWsUrl,
    reconnectBaseDelayMs: readPositiveInteger({
      value: relay.reconnectBaseDelayMs,
      fieldPath: 'relay.reconnectBaseDelayMs',
      configPath: args.configPath,
    }),
    reconnectMaxDelayMs: readPositiveInteger({
      value: relay.reconnectMaxDelayMs,
      fieldPath: 'relay.reconnectMaxDelayMs',
      configPath: args.configPath,
    }),
    heartbeatTimeoutMs: readPositiveInteger({
      value: relay.heartbeatTimeoutMs,
      fieldPath: 'relay.heartbeatTimeoutMs',
      configPath: args.configPath,
    }),
  };
}

/**
 * Returns true when one unknown value is a non-null object record.
 */
export function isRecord(
  args: {
    value: unknown;
  },
): boolean {
  return typeof args.value === 'object' && args.value !== null && !Array.isArray(args.value);
}

/**
 * Reads one required non-empty string config field.
 */
export function readNonEmptyString(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must be a non-empty string.`);
  }

  return args.value;
}

/**
 * Reads one required boolean config field.
 */
export function readBoolean(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): boolean {
  if (typeof args.value !== 'boolean') {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must be a boolean.`);
  }

  return args.value;
}

/**
 * Reads one required positive integer config field.
 */
export function readPositiveInteger(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  if (!Number.isInteger(args.value) || (args.value as number) <= 0) {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must be a positive integer.`);
  }

  return args.value as number;
}

/**
 * Reads one required TCP port field with standard range validation.
 */
export function readPort(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  const port = readPositiveInteger(args);
  if (port < 1 || port > 65535) {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must be within 1-65535.`);
  }

  return port;
}

/**
 * Reads one required mailbox-like address value for sender identity defaults.
 */
export function readEmailLikeAddress(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): string {
  const address = readNonEmptyString(args);
  if (!/^[^\s@]+@[^\s@]+$/.test(address)) {
    throw new Error(`Gateway config at ${args.configPath} field ${args.fieldPath} must look like an email address.`);
  }

  return address;
}
