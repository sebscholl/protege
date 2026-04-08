import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

/**
 * Represents one callable tool declaration exposed to provider adapters.
 */
export type HarnessToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    args: {
      input: Record<string, unknown>;
      context: HarnessToolExecutionContext;
    },
  ) => Promise<Record<string, unknown>>;
};

/**
 * Represents one in-memory registry of loaded harness tools keyed by name.
 */
export type HarnessToolRegistry = Record<string, HarnessToolDefinition>;

/**
 * Represents runtime dependencies available while executing one tool.
 */
export type HarnessToolExecutionContext = {
  runtime: {
    invoke: (
      args: {
        action: string;
        payload: Record<string, unknown>;
      },
    ) => Promise<Record<string, unknown>>;
  };
  logger: GatewayLogger;
  db: ProtegeDatabase;
};
