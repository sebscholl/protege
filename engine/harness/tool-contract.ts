import type { GatewayLogger } from '@engine/gateway/types';

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
 * Represents one normalized send-email request payload used by tool execution.
 */
export type HarnessToolSendEmailRequest = {
  to: string[];
  from: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
};

/**
 * Represents one normalized send-email result payload returned to tool callers.
 */
export type HarnessToolSendEmailResult = {
  messageId?: string;
};

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
  logger?: GatewayLogger;
};
