import type { GatewayTransportConfig, InboundNormalizedMessage } from '@engine/gateway/types';

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { startInboundServer } from '@engine/gateway/inbound';
import { sendGatewayReply } from '@engine/gateway/outbound';
import { buildReplySubject } from '@engine/gateway/threading';

import { createOutboundTransport } from './outbound';

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
  logsDirPath: string;
  attachmentsDirPath: string;
  transport?: GatewayTransportConfig;
  defaultFromAddress: string;
};

/**
 * Starts gateway runtime and wires inbound messages to temporary autoresponder behavior.
 */
export async function startGatewayRuntime(
  args: {
    config: GatewayRuntimeConfig;
  },
): Promise<void> {
  const logger = createGatewayLogger();
  const transport = args.config.transport
    ? createOutboundTransport({ config: args.config.transport })
    : undefined;

  await startInboundServer({
    config: {
      host: args.config.host,
      port: args.config.port,
      dev: args.config.mode === 'dev',
      logsDirPath: args.config.logsDirPath,
      attachmentsDirPath: args.config.attachmentsDirPath,
      logger,
      onMessage: async ({ message }): Promise<void> => {
        await handleInboundForRuntime({
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
 * Handles one inbound message with temporary hardcoded reply behavior.
 */
export async function handleInboundForRuntime(
  args: {
    logger: ReturnType<typeof createGatewayLogger>;
    message: InboundNormalizedMessage;
    transport?: ReturnType<typeof createOutboundTransport>;
    defaultFromAddress: string;
  },
): Promise<void> {
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
      text: 'Protege gateway received your message.',
      inReplyTo: args.message.messageId,
      references: args.message.references,
    },
  });
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

  mkdirSync(parsed.logsDirPath, { recursive: true });
  mkdirSync(parsed.attachmentsDirPath, { recursive: true });

  return parsed;
}

/**
 * Resolves the default gateway config path within the workspace.
 */
export function resolveDefaultGatewayConfigPath(): string {
  return join(process.cwd(), 'config', 'gateway.json');
}
