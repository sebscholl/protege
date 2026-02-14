import type { GatewayTransportConfig, InboundNormalizedMessage } from '@engine/gateway/types';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { startInboundServer } from '@engine/gateway/inbound';
import { sendGatewayReply } from '@engine/gateway/outbound';
import { buildReplySubject } from '@engine/gateway/threading';
import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { createUnifiedLogger } from '@engine/shared/logger';
import {
  extractEmailLocalPart,
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
  defaultFromAddress: string;
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

  await startInboundServer({
    config: {
      host: args.config.host,
      port: args.config.port,
      dev: args.config.mode === 'dev',
      requirePersonaRouting: true,
      attachmentLimits: args.config.attachmentLimits,
      resolvePersonaId: ({ session }): string | undefined => resolvePersonaIdFromSession({
        recipientAddress: session.envelope?.rcptTo?.[0]?.address,
      }),
      resolvePersonaPaths: ({ personaId }) => resolveGatewayPersonaPaths({ personaId }),
      logger,
      onMessage: async ({ message }): Promise<void> => {
        logger.info({
          event: 'gateway.inbound.received',
          context: {
            personaId: message.personaId ?? null,
            threadId: message.threadId,
            messageId: message.messageId,
          },
        });
        persistInboundMessageForRuntime({
          message,
          logger,
        });
        enqueueInboundProcessing({
          logger,
          message,
          transport,
          defaultFromAddress: args.config.defaultFromAddress,
        });
      },
    },
  });
}

/**
 * Enqueues async inbound processing after message persistence is complete.
 */
export function enqueueInboundProcessing(
  args: {
    logger: ReturnType<typeof createGatewayLogger>;
    message: InboundNormalizedMessage;
    transport?: ReturnType<typeof createOutboundTransport>;
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
 * Handles one inbound message by running async harness inference and optional smtp reply.
 */
export async function handleInboundForRuntime(
  args: {
    logger: ReturnType<typeof createGatewayLogger>;
    message: InboundNormalizedMessage;
    transport?: ReturnType<typeof createOutboundTransport>;
    defaultFromAddress: string;
  },
): Promise<void> {
  const result = await runHarnessForPersistedInboundMessage({
    message: args.message,
    defaultFromAddress: args.defaultFromAddress,
    invokeRuntimeAction: createGatewayRuntimeActionInvoker({
      message: args.message,
      logger: args.logger,
      transport: args.transport,
      defaultFromAddress: args.defaultFromAddress,
    }),
    logger: args.logger,
  });

  if (result.invokedActions.includes('email.send')) {
    return;
  }

  if (!args.transport || args.message.from.length === 0) {
    return;
  }

  await sendGatewayReply({
    transport: args.transport,
    logger: args.logger,
    request: {
      to: [args.message.from[0]],
      from: {
        address: args.defaultFromAddress,
      },
      subject: buildReplySubject({ subject: args.message.subject }),
      text: result.responseText,
      inReplyTo: args.message.messageId,
      references: args.message.references,
    },
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
    if (!args.transport) {
      throw new Error('Outbound transport is not configured for email.send.');
    }

    const to = Array.isArray(runtimeArgs.payload.to)
      ? runtimeArgs.payload.to.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )
      : [];
    if (to.length === 0) {
      throw new Error('email.send requires non-empty payload.to recipients.');
    }
    const subject = typeof runtimeArgs.payload.subject === 'string'
      ? runtimeArgs.payload.subject
      : '';
    const text = typeof runtimeArgs.payload.text === 'string'
      ? runtimeArgs.payload.text
      : '';
    const fromAddress = typeof runtimeArgs.payload.from === 'string'
      ? runtimeArgs.payload.from
      : args.defaultFromAddress;

    const info = await sendGatewayReply({
      transport: args.transport,
      logger: args.logger,
      request: {
        to: to.map((address) => ({ address })),
        from: {
          address: fromAddress,
        },
        cc: toAddresses({ value: runtimeArgs.payload.cc }),
        bcc: toAddresses({ value: runtimeArgs.payload.bcc }),
        subject,
        text,
        html: typeof runtimeArgs.payload.html === 'string'
          ? runtimeArgs.payload.html
          : undefined,
        inReplyTo: typeof runtimeArgs.payload.inReplyTo === 'string'
          ? runtimeArgs.payload.inReplyTo
          : args.message.messageId,
        references: toStringArray({ value: runtimeArgs.payload.references }) ?? args.message.references,
        headers: toStringRecord({ value: runtimeArgs.payload.headers }),
      },
    });
    return {
      messageId: info.messageId ?? null,
    };
  };
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
