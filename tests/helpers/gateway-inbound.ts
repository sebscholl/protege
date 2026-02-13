import type { GatewayInboundConfig } from '@engine/gateway/inbound';
import type { InboundNormalizedMessage } from '@engine/gateway/types';

/**
 * Creates a no-op gateway logger for inbound test configuration.
 */
export function createNoopGatewayLogger(): GatewayInboundConfig['logger'] {
  return {
    info: (): void => undefined,
    error: (): void => undefined,
  };
}

/**
 * Creates a standard inbound test config with optional field overrides.
 */
export function createInboundTestConfig(
  args: {
    logsDirPath: string;
    attachmentsDirPath: string;
    onMessage?: (args: { message: InboundNormalizedMessage }) => Promise<void>;
    overrides?: Partial<GatewayInboundConfig>;
  },
): GatewayInboundConfig {
  const baseConfig: GatewayInboundConfig = {
    host: '127.0.0.1',
    port: 2525,
    dev: true,
    logsDirPath: args.logsDirPath,
    attachmentsDirPath: args.attachmentsDirPath,
    logger: createNoopGatewayLogger(),
    onMessage: args.onMessage ?? (async (): Promise<void> => undefined),
  };

  return {
    ...baseConfig,
    ...args.overrides,
  };
}
