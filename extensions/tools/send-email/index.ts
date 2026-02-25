import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@engine/harness/tool-contract';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  threadingMode?: 'reply_current' | 'new_thread';
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
): Record<string, unknown> {
  const configPath = args.configPath ?? resolveDefaultSendEmailToolConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }

  const text = readFileSync(configPath, 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
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
    description: 'Send an outbound email message to one or more recipients. Use this whenever you want the user to receive your response.',
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
        threadingMode: {
          type: 'string',
          enum: ['reply_current', 'new_thread'],
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
    config: Record<string, unknown>;
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
    config: Record<string, unknown>;
  },
): Record<string, unknown> {
  const to = readRequiredEmailAddressArray({
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
  void args.config;
  const from = readOptionalString({ value: args.input.from });

  return {
    to,
    from,
    cc: readOptionalEmailAddressArray({ value: args.input.cc, fieldName: 'cc' }),
    bcc: readOptionalEmailAddressArray({ value: args.input.bcc, fieldName: 'bcc' }),
    subject,
    text,
    html: readOptionalString({ value: args.input.html }),
    inReplyTo: readOptionalString({ value: args.input.inReplyTo }),
    references: readOptionalStringArray({ value: args.input.references, fieldName: 'references' }),
    threadingMode: readOptionalThreadingMode({ value: args.input.threadingMode }),
    headers: readOptionalStringRecord({ value: args.input.headers }),
  };
}

/**
 * Reads one optional threading mode and validates supported send_email values.
 */
export function readOptionalThreadingMode(
  args: {
    value: unknown;
  },
): 'reply_current' | 'new_thread' | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (args.value === 'reply_current' || args.value === 'new_thread') {
    return args.value;
  }

  throw new SendEmailToolInputError('send_email input field "threadingMode" must be "reply_current" or "new_thread".');
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
 * Reads one required array of valid email addresses and raises validation errors when invalid.
 */
export function readRequiredEmailAddressArray(
  args: {
    value: unknown;
    fieldName: string;
  },
): string[] {
  const values = readRequiredStringArray({
    value: args.value,
    fieldName: args.fieldName,
  });
  const invalid = values.find((value) => !isEmailAddress({ value }));
  if (invalid) {
    throw new SendEmailToolInputError(`send_email input field "${args.fieldName}" must contain valid email addresses.`);
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
 * Reads one optional array of valid email addresses and returns undefined when absent.
 */
export function readOptionalEmailAddressArray(
  args: {
    value: unknown;
    fieldName: string;
  },
): string[] | undefined {
  if (args.value === undefined) {
    return undefined;
  }

  return readRequiredEmailAddressArray({
    value: args.value,
    fieldName: args.fieldName,
  });
}

/**
 * Returns true when one string resembles an email address.
 */
export function isEmailAddress(
  args: {
    value: string;
  },
): boolean {
  return /^[^\s@]+@(?:[^\s@]+\.[^\s@]+|localhost)$/.test(args.value);
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
