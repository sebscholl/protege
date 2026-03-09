import type {
  GatewayTransportConfig,
  GatewayLogger,
  InboundNormalizedMessage,
  OutboundReplyRequest,
} from '@engine/gateway/types';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';
import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';

import { handleInboundData, startInboundServer } from '@engine/gateway/inbound';
import {
  handleRelayDeliveryControlMessage,
  registerRelayClientDeliverySignals,
  sendGatewayReply,
  sendGatewayReplyViaRelay,
} from '@engine/gateway/outbound';
import { applyRelayTunnelFrame, createRelayTunnelAssemblyState } from '@engine/gateway/relay-tunnel';
import { startRelayClient } from '@engine/gateway/relay-client';
import type { RelayClientController } from '@engine/gateway/relay-client';
import { buildReplySubject } from '@engine/gateway/threading';
import type { HookEventPayloadByName } from '@engine/harness/hooks/events';
import { isHookEventName } from '@engine/harness/hooks/events';
import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
import { recoverDirtyMemorySynthesisStates } from '@engine/harness/hooks/recovery';
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
  listPersonas,
  readPersonaMetadata,
  resolvePersonaConfigDirPath,
  resolveDefaultPersonaRoots,
  resolvePersonaByRecipientAddress,
  resolvePersonaMemoryPaths,
  updatePersonaEmailAddress,
} from '@engine/shared/personas';
import { evaluateGatewayAccess, readSecurityRuntimeConfig } from '@engine/shared/security-config';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';
import { readInferenceRuntimeConfig } from '@engine/harness/config';

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
    mailDomain: string;
  },
): string | undefined {
  if (!args.recipientAddress) {
    return undefined;
  }

  const persona = resolvePersonaByRecipientAddress({
    recipientAddress: args.recipientAddress,
    mailDomain: args.mailDomain,
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
  const securityConfig = readSecurityRuntimeConfig();
  const hooks = await loadHookRegistry().catch((error: Error) => {
    process.stderr.write(`hook.dispatch.load_failed scope=gateway message=${error.message}\n`);
    return [];
  });
  const hookDispatcher = createHookDispatcher({
    hooks,
    onHookError: (
      hookName: string,
      event,
      error: Error,
    ): void => {
      process.stderr.write(`hook.dispatch.failed scope=gateway hookName=${hookName} event=${event} message=${error.message}\n`);
    },
  });
  const logger = createUnifiedLogger({
    logsDirPath: globalConfig.logsDirPath,
    scope: 'gateway',
    consoleLogFormat: globalConfig.consoleLogFormat,
    prettyLogTheme: globalConfig.prettyLogTheme,
    onEmit: (
      payload: Record<string, unknown>,
    ): void => {
      if (typeof payload.event !== 'string' || !isHookEventName(payload.event)) {
        return;
      }
      hookDispatcher.dispatch(payload.event, payload as HookEventPayloadByName[typeof payload.event]);
    },
  });
  recoverDirtyMemorySynthesisStates({
    hookDispatcher,
    logger: {
      info: logger.info,
      error: logger.error,
    },
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
    securityConfig,
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
    securityConfig?: ReturnType<typeof readSecurityRuntimeConfig>;
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
  evaluateSenderAccess: (
    args: {
      senderAddress: string;
      session: SMTPServerSession;
      personaId?: string;
    },
  ) => {
    allowed: boolean;
    reason: string;
    matchedRule?: string;
  };
  logger: ReturnType<typeof createUnifiedLogger>;
  relayClientsByPersonaId?: Map<string, RelayClientController>;
  onMessage: (
    args: {
      message: InboundNormalizedMessage;
    },
  ) => Promise<void>;
} {
  const gatewayAccessPolicy = args.securityConfig?.gatewayAccess ?? readSecurityRuntimeConfig().gatewayAccess;

  return {
    host: args.runtimeConfig.host,
    port: args.runtimeConfig.port,
    dev: args.runtimeConfig.mode === 'dev',
    requirePersonaRouting: true,
    attachmentLimits: args.runtimeConfig.attachmentLimits,
    resolvePersonaId: ({ session }): string | undefined => resolvePersonaIdFromSession({
      recipientAddress: session.envelope?.rcptTo?.[0]?.address,
      mailDomain: args.runtimeConfig.mailDomain,
    }),
    resolvePersonaPaths: ({ personaId }) => resolveGatewayPersonaPaths({ personaId }),
    evaluateSenderAccess: ({ senderAddress }) => evaluateGatewayAccess({
      senderAddress,
      policy: gatewayAccessPolicy,
    }),
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
          const status = controller.readStatus();
          args.logger.info({
            event: 'gateway.relay.authenticated',
            context: {
              personaId: persona.personaId,
              publicKeyBase32: persona.publicKeyBase32,
              reconnectAttempt: status.reconnectAttempt,
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
          handleRelayDeliveryControlMessage({
            relayClient: controller,
            payload: controlArgs.payload,
          });
        },
      },
    });
    registerRelayClientDeliverySignals({
      relayClient: controller,
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
  const defaultRecursionDepth = readDefaultRecursionDepth();
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
        ...(runtimeArgs.action === 'email.send' ? {
          to: toStringArray({ value: runtimeArgs.payload.to }) ?? [],
          subject: typeof runtimeArgs.payload.subject === 'string' ? runtimeArgs.payload.subject : null,
          attachmentCount: readAttachmentCountFromRuntimePayload({
            value: runtimeArgs.payload.attachments,
          }),
          attachmentNames: readAttachmentNamesFromRuntimePayload({
            value: runtimeArgs.payload.attachments,
          }),
        } : {}),
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
    if (runtimeArgs.action === 'web.fetch') {
      return runWebFetchRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'web.search') {
      return runWebSearchRuntimeAction({
        payload: runtimeArgs.payload,
      });
    }
    if (runtimeArgs.action === 'shell.exec') {
      return runShellExecRuntimeAction({
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
      defaultRecursionDepth,
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
        ...(runtimeArgs.action === 'email.send' ? {
          to: request.to.map((item) => item.address),
          subject: request.subject,
          attachmentCount: request.attachments?.length ?? 0,
          attachmentNames: (request.attachments ?? []).map((attachment) => attachment.filename ?? basename(attachment.path)),
        } : {}),
      },
    });
    return {
      messageId,
    };
  };
}

/**
 * Reads default recursion depth from inference config with a safe fallback for gateway actions.
 */
export function readDefaultRecursionDepth(): number {
  try {
    return readInferenceRuntimeConfig().recursionDepth;
  } catch {
    return 3;
  }
}

/**
 * Reads one attachment count from unknown runtime payload value.
 */
export function readAttachmentCountFromRuntimePayload(
  args: {
    value: unknown;
  },
): number {
  return Array.isArray(args.value) ? args.value.length : 0;
}

/**
 * Reads attachment display names from unknown runtime payload value for structured logs.
 */
export function readAttachmentNamesFromRuntimePayload(
  args: {
    value: unknown;
  },
): string[] {
  if (!Array.isArray(args.value) || args.value.length === 0) {
    return [];
  }

  return args.value.map((item) => {
    const record = typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {};
    const filename = record.filename;
    if (typeof filename === 'string' && filename.trim().length > 0) {
      return filename;
    }

    const path = record.path;
    return typeof path === 'string' && path.trim().length > 0
      ? basename(path)
      : 'unknown';
  });
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
    enforceWorkspaceRoot: false,
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
    enforceWorkspaceRoot: false,
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
  }
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
    enforceWorkspaceRoot: false,
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
    execFileSyncFn?: RipgrepExecFileSync;
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
      enforceWorkspaceRoot: false,
    });
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'file.glob',
  }) ?? 100;
  const workspaceRoot = process.cwd();
  let paths: string[];
  try {
    const output = runRipgrepCommand({
      args: ['--files', '-g', pattern],
      cwd: targetCwd,
      execFileSyncFn: args.execFileSyncFn,
      actionName: 'file.glob',
    });
    paths = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => relative(workspaceRoot, resolve(targetCwd, line)));
  } catch (error) {
    if (!isRipgrepUnavailableError({ error })) {
      throw error;
    }

    const globMatcher = createGlobMatcher({
      pattern,
    });
    paths = listRelativeFilePaths({
      cwd: targetCwd,
    })
      .filter((filePath) => globMatcher(filePath))
      .map((filePath) => relative(workspaceRoot, resolve(targetCwd, filePath)));
  }

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
    execFileSyncFn?: RipgrepExecFileSync;
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
      enforceWorkspaceRoot: false,
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
  const workspaceRoot = process.cwd();
  let matches: Array<{
    path: string;
    line: number;
    column: number;
    preview: string;
  }>;
  try {
    const output = runRipgrepCommand({
      args: ripgrepArgs,
      cwd: searchRoot,
      execFileSyncFn: args.execFileSyncFn,
      actionName: 'file.search',
      allowNoMatches: true,
    });
    matches = output
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
  } catch (error) {
    if (!isRipgrepUnavailableError({ error })) {
      throw error;
    }
    matches = runSearchFallback({
      query,
      searchRoot,
      workspaceRoot,
      isRegex,
      maxResults,
    });
  }

  return {
    matches,
  };
}

/**
 * Returns true when a ripgrep invocation fails because the executable is unavailable.
 */
export function isRipgrepUnavailableError(
  args: {
    error: unknown;
  },
): boolean {
  return args.error instanceof Error
    && args.error.message.includes('spawnSync rg ENOENT');
}

/**
 * Lists workspace-relative file paths below one cwd using POSIX separators.
 */
export function listRelativeFilePaths(
  args: {
    cwd: string;
  },
): string[] {
  const filePaths: string[] = [];
  collectRelativeFilePaths({
    rootCwd: args.cwd,
    currentRelativePath: '',
    output: filePaths,
  });
  return filePaths;
}

/**
 * Recursively collects relative file paths below one root path.
 */
export function collectRelativeFilePaths(
  args: {
    rootCwd: string;
    currentRelativePath: string;
    output: string[];
  },
): void {
  const absolutePath = args.currentRelativePath.length > 0
    ? join(args.rootCwd, args.currentRelativePath)
    : args.rootCwd;
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    const entryRelativePath = args.currentRelativePath.length > 0
      ? `${args.currentRelativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      collectRelativeFilePaths({
        rootCwd: args.rootCwd,
        currentRelativePath: entryRelativePath,
        output: args.output,
      });
      continue;
    }

    if (entry.isFile()) {
      args.output.push(entryRelativePath);
    }
  }
}

/**
 * Creates a file-path predicate from one glob pattern.
 */
export function createGlobMatcher(
  args: {
    pattern: string;
  },
): (value: string) => boolean {
  const expression = globPatternToRegExp({
    pattern: args.pattern,
  });
  return (value: string): boolean => expression.test(value);
}

/**
 * Converts a basic glob pattern into a regular-expression matcher.
 */
export function globPatternToRegExp(
  args: {
    pattern: string;
  },
): RegExp {
  const escapedPattern = args.pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1');
  const regexPattern = escapedPattern
    .replace(/\*\*/g, '__PROTEGE_GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__PROTEGE_GLOBSTAR__/g, '.*');
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Runs one file-search fallback implementation when ripgrep is unavailable.
 */
export function runSearchFallback(
  args: {
    query: string;
    searchRoot: string;
    workspaceRoot: string;
    isRegex: boolean;
    maxResults: number;
  },
): Array<{
  path: string;
  line: number;
  column: number;
  preview: string;
}> {
  const output: Array<{
    path: string;
    line: number;
    column: number;
    preview: string;
  }> = [];
  const matcher = args.isRegex
    ? new RegExp(args.query)
    : undefined;
  for (const relativePath of listRelativeFilePaths({
    cwd: args.searchRoot,
  })) {
    if (output.length >= args.maxResults) {
      break;
    }

    const absolutePath = resolve(args.searchRoot, relativePath);
    const fileText = readTextFileSafely({
      absolutePath,
    });
    if (fileText === undefined) {
      continue;
    }

    const lines = fileText.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (output.length >= args.maxResults) {
        break;
      }

      const preview = lines[index];
      const column = matcher
        ? findRegexColumn({
          matcher,
          preview,
        })
        : preview.indexOf(args.query) + 1;
      if (column <= 0) {
        continue;
      }

      output.push({
        path: relative(args.workspaceRoot, absolutePath),
        line: index + 1,
        column,
        preview,
      });
    }
  }

  return output;
}

/**
 * Returns one 1-based column index for the first regex match on one line.
 */
export function findRegexColumn(
  args: {
    matcher: RegExp;
    preview: string;
  },
): number {
  args.matcher.lastIndex = 0;
  const match = args.matcher.exec(args.preview);
  return match?.index === undefined ? 0 : match.index + 1;
}

/**
 * Reads one UTF-8 file and returns undefined for non-readable/binary content.
 */
export function readTextFileSafely(
  args: {
    absolutePath: string;
  },
): string | undefined {
  try {
    return readFileSync(args.absolutePath, 'utf8');
  } catch {
    return undefined;
  }
}

const DEFAULT_WEB_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_WEB_FETCH_MAX_BYTES = 200000;
const DEFAULT_WEB_FETCH_MAX_REDIRECTS = 5;

/**
 * Runs one web.fetch runtime action and returns normalized readable page content.
 */
export async function runWebFetchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    fetchFn?: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const url = readRequiredHttpRuntimeUrl({
    payload: args.payload,
    fieldName: 'url',
    actionName: 'web.fetch',
  });
  const timeoutMs = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'timeoutMs',
    actionName: 'web.fetch',
  }) ?? DEFAULT_WEB_FETCH_TIMEOUT_MS;
  const maxBytes = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxBytes',
    actionName: 'web.fetch',
  }) ?? DEFAULT_WEB_FETCH_MAX_BYTES;
  const fetchImpl = args.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const responseWithUrl = await fetchWithRedirectLimit({
      url,
      signal: controller.signal,
      fetchFn: fetchImpl,
      maxRedirects: DEFAULT_WEB_FETCH_MAX_REDIRECTS,
    });
    if (!responseWithUrl.response.ok) {
      throw new Error(`web.fetch received upstream status ${responseWithUrl.response.status}.`);
    }

    const contentType = readResponseContentType({
      response: responseWithUrl.response,
    });
    if (!isSupportedTextContentType({ contentType })) {
      throw new Error(`web.fetch does not support content-type ${contentType || 'unknown'}.`);
    }

    const body = await readResponseTextWithLimit({
      response: responseWithUrl.response,
      maxBytes,
    });
    const parsed = parseWebFetchBody({
      contentType,
      bodyText: body.text,
    });

    return {
      url: responseWithUrl.url,
      status: responseWithUrl.response.status,
      contentType,
      title: parsed.title,
      text: parsed.text,
      truncated: body.truncated,
    };
  } catch (error) {
    if (isAbortError({ error })) {
      throw new Error(`web.fetch timed out after ${timeoutMs}ms.`);
    }
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('web.fetch failed.');
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Represents one redirected fetch completion payload.
 */
export type RedirectedFetchResult = {
  response: Response;
  url: string;
};

/**
 * Fetches one URL while enforcing a bounded redirect-follow policy.
 */
export async function fetchWithRedirectLimit(
  args: {
    url: string;
    signal: AbortSignal;
    fetchFn: typeof fetch;
    maxRedirects: number;
  },
): Promise<RedirectedFetchResult> {
  let currentUrl = args.url;
  for (let redirectCount = 0; redirectCount <= args.maxRedirects; redirectCount += 1) {
    const response = await args.fetchFn(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: args.signal,
      headers: {
        'user-agent': 'protege-web-fetch/1.0',
      },
    });
    if (!isRedirectStatus({ status: response.status })) {
      return {
        response,
        url: currentUrl,
      };
    }
    if (redirectCount === args.maxRedirects) {
      throw new Error(`web.fetch exceeded redirect limit (${args.maxRedirects}).`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('web.fetch redirect response missing location header.');
    }
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('web.fetch exceeded redirect limit.');
}

/**
 * Returns true when one HTTP status code represents redirect behavior.
 */
export function isRedirectStatus(
  args: {
    status: number;
  },
): boolean {
  return args.status === 301
    || args.status === 302
    || args.status === 303
    || args.status === 307
    || args.status === 308;
}

/**
 * Reads normalized content-type metadata from one fetch response.
 */
export function readResponseContentType(
  args: {
    response: Response;
  },
): string {
  const header = args.response.headers.get('content-type');
  if (!header) {
    return '';
  }

  return header.toLowerCase().split(';')[0]?.trim() ?? '';
}

/**
 * Returns true when one content-type is supported for readable-text extraction.
 */
export function isSupportedTextContentType(
  args: {
    contentType: string;
  },
): boolean {
  if (args.contentType.startsWith('text/')) {
    return true;
  }

  return args.contentType === 'application/xhtml+xml'
    || args.contentType === 'application/xml'
    || args.contentType === 'application/json';
}

/**
 * Reads response body text while enforcing a maximum byte budget.
 */
export async function readResponseTextWithLimit(
  args: {
    response: Response;
    maxBytes: number;
  },
): Promise<{
  text: string;
  truncated: boolean;
}> {
  const fullText = await args.response.text();
  const fullBuffer = Buffer.from(fullText, 'utf8');
  const truncated = fullBuffer.length > args.maxBytes;
  return {
    text: fullBuffer.subarray(0, args.maxBytes).toString('utf8'),
    truncated,
  };
}

/**
 * Parses one fetched body into normalized title + readable text fields.
 */
export function parseWebFetchBody(
  args: {
    contentType: string;
    bodyText: string;
  },
): {
  title: string | null;
  text: string;
} {
  if (args.contentType === 'text/html' || args.contentType === 'application/xhtml+xml') {
    const title = extractHtmlTitle({
      html: args.bodyText,
    });
    const text = extractReadableHtmlText({
      html: args.bodyText,
    });
    return {
      title,
      text,
    };
  }

  return {
    title: null,
    text: normalizeReadableText({
      text: args.bodyText,
    }),
  };
}

/**
 * Extracts one best-effort HTML title value from a document body.
 */
export function extractHtmlTitle(
  args: {
    html: string;
  },
): string | null {
  const match = args.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }

  const title = normalizeReadableText({
    text: decodeBasicHtmlEntities({
      text: match[1],
    }),
  });
  return title.length > 0 ? title : null;
}

/**
 * Extracts readable text from one HTML document using lightweight tag stripping.
 */
export function extractReadableHtmlText(
  args: {
    html: string;
  },
): string {
  const withoutScripts = args.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeReadableText({
    text: decodeBasicHtmlEntities({
      text: withoutTags,
    }),
  });
}

/**
 * Decodes a small set of common HTML entities for readable text output.
 */
export function decodeBasicHtmlEntities(
  args: {
    text: string;
  },
): string {
  return args.text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'');
}

/**
 * Normalizes whitespace/newlines for readable body and title text.
 */
export function normalizeReadableText(
  args: {
    text: string;
  },
): string {
  const normalizedLines = args.text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  return normalizedLines.join('\n');
}

/**
 * Reads one required runtime URL and enforces http/https schemes.
 */
export function readRequiredHttpRuntimeUrl(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const raw = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: args.fieldName,
    actionName: args.actionName,
  });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must use http or https.`);
  }

  return parsed.toString();
}

/**
 * Returns true when an unknown error represents request abortion.
 */
export function isAbortError(
  args: {
    error: unknown;
  },
): boolean {
  return args.error instanceof DOMException && args.error.name === 'AbortError';
}

/**
 * Represents one normalized web-search result entry returned to tools.
 */
export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
};

/**
 * Runs one web.search runtime action using the configured provider adapter.
 */
export async function runWebSearchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    fetchFn?: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const provider = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'provider',
    actionName: 'web.search',
  });
  const query = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'query',
    actionName: 'web.search',
  });
  const apiKey = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'apiKey',
    actionName: 'web.search',
  });
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'web.search',
  }) ?? 8;
  const baseUrl = typeof args.payload.baseUrl === 'string' && args.payload.baseUrl.trim().length > 0
    ? args.payload.baseUrl
    : undefined;
  const fetchImpl = args.fetchFn ?? fetch;

  if (provider === 'tavily') {
    return runTavilyWebSearch({
      query,
      maxResults,
      apiKey,
      baseUrl: baseUrl ?? 'https://api.tavily.com',
      fetchFn: fetchImpl,
    });
  }
  if (provider === 'perplexity') {
    return runPerplexityWebSearch({
      query,
      maxResults,
      apiKey,
      baseUrl: baseUrl ?? 'https://api.perplexity.ai',
      fetchFn: fetchImpl,
    });
  }

  throw new Error(`web.search unsupported provider: ${provider}`);
}

/**
 * Executes one Tavily-backed web search and normalizes result payload fields.
 */
export async function runTavilyWebSearch(
  args: {
    query: string;
    maxResults: number;
    apiKey: string;
    baseUrl: string;
    fetchFn: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const response = await args.fetchFn(`${args.baseUrl}/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      query: args.query,
      max_results: args.maxResults,
    }),
  });
  if (!response.ok) {
    throw new Error(`web.search tavily failed with status ${response.status}.`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const normalized = rawResults
    .map((item) => normalizeTavilyResult({
      value: item,
    }))
    .filter((item): item is WebSearchResult => item !== undefined);
  return {
    provider: 'tavily',
    query: args.query,
    results: normalized.slice(0, args.maxResults),
    truncated: normalized.length > args.maxResults,
    totalReturned: normalized.length,
  };
}

/**
 * Normalizes one Tavily response entry into shared web-search result shape.
 */
export function normalizeTavilyResult(
  args: {
    value: unknown;
  },
): WebSearchResult | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  if (typeof record.title !== 'string' || typeof record.url !== 'string') {
    return undefined;
  }

  return {
    title: record.title,
    url: record.url,
    snippet: typeof record.content === 'string' ? record.content : '',
    publishedAt: typeof record.published_date === 'string' ? record.published_date : undefined,
    source: typeof record.source === 'string' ? record.source : undefined,
  };
}

/**
 * Executes one Perplexity-backed web search and normalizes result payload fields.
 */
export async function runPerplexityWebSearch(
  args: {
    query: string;
    maxResults: number;
    apiKey: string;
    baseUrl: string;
    fetchFn: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const response = await args.fetchFn(`${args.baseUrl}/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      query: args.query,
      max_results: args.maxResults,
    }),
  });
  if (!response.ok) {
    throw new Error(`web.search perplexity failed with status ${response.status}.`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const normalized = rawResults
    .map((item) => normalizePerplexityResult({
      value: item,
    }))
    .filter((item): item is WebSearchResult => item !== undefined);
  return {
    provider: 'perplexity',
    query: args.query,
    results: normalized.slice(0, args.maxResults),
    truncated: normalized.length > args.maxResults,
    totalReturned: normalized.length,
  };
}

/**
 * Normalizes one Perplexity response entry into shared web-search result shape.
 */
export function normalizePerplexityResult(
  args: {
    value: unknown;
  },
): WebSearchResult | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  if (typeof record.title !== 'string' || typeof record.url !== 'string') {
    return undefined;
  }

  return {
    title: record.title,
    url: record.url,
    snippet: typeof record.snippet === 'string' ? record.snippet : '',
    publishedAt: typeof record.published_at === 'string' ? record.published_at : undefined,
    source: typeof record.source === 'string' ? record.source : undefined,
  };
}

/**
 * Runs one ripgrep command and returns UTF-8 stdout with actionable error mapping.
 */
export type RipgrepExecFileSync = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

/**
 * Runs one ripgrep command and returns UTF-8 stdout with actionable error mapping.
 */
export function runRipgrepCommand(
  args: {
    args: string[];
    cwd: string;
    actionName: string;
    allowNoMatches?: boolean;
    execFileSyncFn?: RipgrepExecFileSync;
  },
): string {
  const execSync = args.execFileSyncFn ?? ((
    file,
    commandArgs,
    options,
  ): string => execFileSync(file, commandArgs, options));
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
 * Represents one shell execution result payload before runtime response mapping.
 */
export type ShellExecRuntimeResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  shell: string;
  shellType: string;
  cwd: string;
  platform: NodeJS.Platform;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const DEFAULT_SHELL_MAX_OUTPUT_CHARS = 12000;

/**
 * Runs one shell.exec runtime action and returns bounded structured shell output.
 */
export async function runShellExecRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    executeShellCommandFn?: (
      args: {
        command: string;
        cwd: string;
        timeoutMs: number;
        maxOutputChars: number;
      },
    ) => Promise<ShellExecRuntimeResult>;
  },
): Promise<Record<string, unknown>> {
  const command = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'command',
    actionName: 'shell.exec',
  });
  const timeoutMs = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'timeoutMs',
    actionName: 'shell.exec',
  }) ?? DEFAULT_SHELL_TIMEOUT_MS;
  const maxOutputChars = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxOutputChars',
    actionName: 'shell.exec',
  }) ?? DEFAULT_SHELL_MAX_OUTPUT_CHARS;
  const cwd = args.payload.workdir === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'workdir',
      actionName: 'shell.exec',
      enforceWorkspaceRoot: true,
    });
  const executeCommand = args.executeShellCommandFn ?? executeShellCommand;
  return executeCommand({
    command,
    cwd,
    timeoutMs,
    maxOutputChars,
  });
}

/**
 * Executes one shell command with timeout and output caps using the current runtime shell.
 */
export function executeShellCommand(
  args: {
    command: string;
    cwd: string;
    timeoutMs: number;
    maxOutputChars: number;
  },
): Promise<ShellExecRuntimeResult> {
  const shellExecutable = resolveShellExecutable();
  const shellType = resolveShellType({
    shellExecutable,
  });
  const shellArgs = resolveShellArgs({
    shellType,
    command: args.command,
  });
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(shellExecutable, shellArgs, {
      cwd: args.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let completed = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, args.timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stdout += text;
      if (stdout.length > args.maxOutputChars) {
        stdout = stdout.slice(0, args.maxOutputChars);
        stdoutTruncated = true;
      }
    });

    child.stderr.on('data', (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stderr += text;
      if (stderr.length > args.maxOutputChars) {
        stderr = stderr.slice(0, args.maxOutputChars);
        stderrTruncated = true;
      }
    });

    child.on('close', (code: number | null): void => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeoutHandle);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
        shell: shellExecutable,
        shellType,
        cwd: args.cwd,
        platform: process.platform,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

/**
 * Resolves one runtime shell executable path from environment or platform defaults.
 */
export function resolveShellExecutable(): string {
  if (process.env.SHELL && process.env.SHELL.trim().length > 0) {
    return process.env.SHELL;
  }
  if (process.env.COMSPEC && process.env.COMSPEC.trim().length > 0) {
    return process.env.COMSPEC;
  }
  return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
}

/**
 * Resolves one shell type label from executable path text.
 */
export function resolveShellType(
  args: {
    shellExecutable: string;
  },
): string {
  const executableLower = args.shellExecutable.toLowerCase();
  if (executableLower.includes('powershell') || executableLower.includes('pwsh')) {
    return 'powershell';
  }
  if (executableLower.includes('cmd.exe')) {
    return 'cmd';
  }
  if (executableLower.endsWith('/zsh') || executableLower === 'zsh') {
    return 'zsh';
  }
  if (executableLower.endsWith('/bash') || executableLower === 'bash') {
    return 'bash';
  }
  if (executableLower.endsWith('/sh') || executableLower === 'sh') {
    return 'sh';
  }

  return 'shell';
}

/**
 * Resolves command argument vectors for supported shell types.
 */
export function resolveShellArgs(
  args: {
    shellType: string;
    command: string;
  },
): string[] {
  if (args.shellType === 'powershell') {
    return ['-NoProfile', '-Command', args.command];
  }
  if (args.shellType === 'cmd') {
    return ['/d', '/s', '/c', args.command];
  }

  return ['-lc', args.command];
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
    enforceWorkspaceRoot?: boolean;
  },
): string {
  const rawPath = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: args.fieldName,
    actionName: args.actionName,
  });
  if (args.enforceWorkspaceRoot === true) {
    return resolveWorkspacePath({
      inputPath: rawPath,
      actionName: args.actionName,
    });
  }

  return resolve(rawPath);
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
    defaultRecursionDepth?: number;
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
  const recursionHeaderValue = resolveOutboundRecursionHeaderValue({
    message: args.message,
    defaultRecursionDepth: args.defaultRecursionDepth ?? 3,
  });
  const baseHeaders = toStringRecord({ value: args.payload.headers });
  const headers = {
    ...(baseHeaders ?? {}),
    'X-Protege-Recursion': String(recursionHeaderValue),
  };

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
    headers,
    attachments: toOutboundAttachments({ value: args.payload.attachments }),
  };
}

/**
 * Resolves outbound recursion header value by decrementing inbound thread budget when present.
 */
export function resolveOutboundRecursionHeaderValue(
  args: {
    message: InboundNormalizedMessage;
    defaultRecursionDepth: number;
  },
): number {
  const inboundRemaining = readInboundRecursionRemaining({
    message: args.message,
  });
  if (inboundRemaining === undefined) {
    return args.defaultRecursionDepth;
  }

  return Math.max(0, inboundRemaining);
}

/**
 * Reads optional recursion remaining value from inbound message metadata.
 */
export function readInboundRecursionRemaining(
  args: {
    message: InboundNormalizedMessage;
  },
): number | undefined {
  const metadata = args.message.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>).recursion_remaining;
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  return undefined;
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
 * Converts unknown payload attachment values into validated outbound attachment descriptors.
 */
export function toOutboundAttachments(
  args: {
    value: unknown;
  },
): Array<{
  path: string;
  filename?: string;
  contentType?: string;
}> | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (!Array.isArray(args.value)) {
    throw new Error('email.send payload.attachments must be an array.');
  }

  const attachments = args.value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`email.send payload.attachments[${index}] must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const path = typeof record.path === 'string'
      ? record.path.trim()
      : '';
    if (path.length === 0) {
      throw new Error(`email.send payload.attachments[${index}].path is required.`);
    }

    const filename = typeof record.filename === 'string' && record.filename.trim().length > 0
      ? record.filename
      : undefined;
    const contentType = typeof record.contentType === 'string' && record.contentType.trim().length > 0
      ? record.contentType
      : undefined;
    return {
      path,
      filename,
      contentType,
    };
  });

  return attachments.length > 0 ? attachments : undefined;
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
  return join(process.cwd(), 'configs', 'gateway.json');
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
  const attachmentLimits = validateGatewayAttachmentLimits({
    value: parsed.attachmentLimits,
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
    attachmentLimits,
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
 * Validates optional gateway attachment limit config section.
 */
export function validateGatewayAttachmentLimits(
  args: {
    value: unknown;
    configPath: string;
  },
): Partial<AttachmentLimits> | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (!isRecord({
    value: args.value,
  })) {
    throw new Error(`Gateway config at ${args.configPath} field attachmentLimits must be an object.`);
  }

  const limits = args.value as Record<string, unknown>;
  const output: Partial<AttachmentLimits> = {};
  if (limits.maxAttachmentBytes !== undefined) {
    output.maxAttachmentBytes = readPositiveInteger({
      value: limits.maxAttachmentBytes,
      fieldPath: 'attachmentLimits.maxAttachmentBytes',
      configPath: args.configPath,
    });
  }
  if (limits.maxAttachmentsPerMessage !== undefined) {
    output.maxAttachmentsPerMessage = readPositiveInteger({
      value: limits.maxAttachmentsPerMessage,
      fieldPath: 'attachmentLimits.maxAttachmentsPerMessage',
      configPath: args.configPath,
    });
  }
  if (limits.maxTotalAttachmentBytes !== undefined) {
    output.maxTotalAttachmentBytes = readPositiveInteger({
      value: limits.maxTotalAttachmentBytes,
      fieldPath: 'attachmentLimits.maxTotalAttachmentBytes',
      configPath: args.configPath,
    });
  }

  return output;
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
