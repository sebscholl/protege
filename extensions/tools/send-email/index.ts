import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@engine/harness/tool-contract';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents static configuration for the send-email tool extension.
 */
export type SendEmailToolConfig = {
  defaultFromAddress?: string;
};

/**
 * Represents the accepted input payload schema for send_email execution.
 */
export type SendEmailToolInput = {
  to: string[];
  subject: string;
  text: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  html?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
};

/**
 * Represents one typed validation error for invalid send_email inputs.
 */
export class SendEmailToolInputError extends Error {}

/**
 * Resolves the default configuration path for the send-email extension.
 */
export function resolveDefaultSendEmailToolConfigPath(): string {
  return join(process.cwd(), 'extensions', 'tools', 'send-email', 'config.json');
}

/**
 * Reads send-email extension configuration from disk when present.
 */
export function readSendEmailToolConfig(
  args: {
    configPath?: string;
  } = {},
): SendEmailToolConfig {
  const configPath = args.configPath ?? resolveDefaultSendEmailToolConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }

  const text = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    defaultFromAddress: readOptionalString({
      value: parsed.default_from_address,
    }),
  };
}

/**
 * Creates one send_email tool definition with validated input execution behavior.
 */
export function createSendEmailTool(
  args: {
    configPath?: string;
  } = {},
): HarnessToolDefinition {
  const config = readSendEmailToolConfig({
    configPath: args.configPath,
  });
  return {
    name: 'send_email',
    description: 'Send an outbound email message to one or more recipients.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'subject', 'text'],
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        subject: {
          type: 'string',
        },
        text: {
          type: 'string',
        },
        from: {
          type: 'string',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
        },
        html: {
          type: 'string',
        },
        inReplyTo: {
          type: 'string',
        },
        references: {
          type: 'array',
          items: { type: 'string' },
        },
        headers: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => {
      return executeSendEmailTool({
        input: executeArgs.input,
        context: executeArgs.context,
        config,
      });
    },
  };
}

/**
 * Executes the send_email tool using runtime-provided outbound email capability.
 */
export async function executeSendEmailTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
    config: SendEmailToolConfig;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeSendEmailInput({
    input: args.input,
    config: args.config,
  });
  const result = await args.context.runtime.invoke({
    action: 'email.send',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.send_email.completed',
    context: {
      to: normalized.to,
      subject: normalized.subject,
      messageId: typeof result.messageId === 'string' ? result.messageId : null,
    },
  });
  return {
    messageId: typeof result.messageId === 'string' ? result.messageId : null,
  };
}

/**
 * Validates and normalizes one raw tool input payload into send-email request fields.
 */
export function normalizeSendEmailInput(
  args: {
    input: Record<string, unknown>;
    config: SendEmailToolConfig;
  },
): Record<string, unknown> {
  const to = readRequiredStringArray({
    value: args.input.to,
    fieldName: 'to',
  });
  const subject = readRequiredString({
    value: args.input.subject,
    fieldName: 'subject',
  });
  const text = readRequiredString({
    value: args.input.text,
    fieldName: 'text',
  });
  const from = readOptionalString({ value: args.input.from })
    ?? args.config.defaultFromAddress;
  if (!from) {
    throw new SendEmailToolInputError(
      'send_email requires from or a configured default_from_address.',
    );
  }

  return {
    to,
    from,
    cc: readOptionalStringArray({ value: args.input.cc, fieldName: 'cc' }),
    bcc: readOptionalStringArray({ value: args.input.bcc, fieldName: 'bcc' }),
    subject,
    text,
    html: readOptionalString({ value: args.input.html }),
    inReplyTo: readOptionalString({ value: args.input.inReplyTo }),
    references: readOptionalStringArray({ value: args.input.references, fieldName: 'references' }),
    headers: readOptionalStringRecord({ value: args.input.headers }),
  };
}

/**
 * Reads one required string and raises a typed input validation error when invalid.
 */
export function readRequiredString(
  args: {
    value: unknown;
    fieldName: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new SendEmailToolInputError(`send_email input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one optional non-empty string and returns undefined when absent.
 */
export function readOptionalString(
  args: {
    value: unknown;
  },
): string | undefined {
  return typeof args.value === 'string' && args.value.trim().length > 0
    ? args.value
    : undefined;
}

/**
 * Reads one required array of non-empty strings and raises validation errors when invalid.
 */
export function readRequiredStringArray(
  args: {
    value: unknown;
    fieldName: string;
  },
): string[] {
  if (!Array.isArray(args.value) || args.value.length === 0) {
    throw new SendEmailToolInputError(`send_email input field "${args.fieldName}" must be a non-empty string array.`);
  }

  const values = args.value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  if (values.length !== args.value.length) {
    throw new SendEmailToolInputError(`send_email input field "${args.fieldName}" must contain only non-empty strings.`);
  }

  return values;
}

/**
 * Reads one optional array of non-empty strings and returns undefined when absent.
 */
export function readOptionalStringArray(
  args: {
    value: unknown;
    fieldName: string;
  },
): string[] | undefined {
  if (args.value === undefined) {
    return undefined;
  }

  return readRequiredStringArray({
    value: args.value,
    fieldName: args.fieldName,
  });
}

/**
 * Reads one optional record of string key-value pairs and validates all values.
 */
export function readOptionalStringRecord(
  args: {
    value: unknown;
  },
): Record<string, string> | undefined {
  if (args.value === undefined) {
    return undefined;
  }

  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    throw new SendEmailToolInputError('send_email input field "headers" must be a string object.');
  }

  const record = args.value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== 'string') {
      throw new SendEmailToolInputError('send_email input field "headers" must contain string values.');
    }
    output[key] = value;
  }

  return output;
}

/**
 * Exports the send-email tool module contract consumed by the harness registry loader.
 */
export const tool = createSendEmailTool();
