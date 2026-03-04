import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@engine/harness/tools/contract';

/**
 * Represents accepted input payload for web fetch tool execution.
 */
export type WebFetchToolInput = {
  url: string;
  maxBytes?: number;
  timeoutMs?: number;
};

/**
 * Represents one typed validation error for invalid web fetch inputs.
 */
export class WebFetchToolInputError extends Error {}

/**
 * Creates one web_fetch tool definition with validated input execution behavior.
 */
export function createWebFetchTool(): HarnessToolDefinition {
  return {
    name: 'web_fetch',
    description: 'Fetch one HTTP(S) URL and return readable page content.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: {
          type: 'string',
        },
        maxBytes: {
          type: 'integer',
          minimum: 1,
        },
        timeoutMs: {
          type: 'integer',
          minimum: 1,
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => {
      return executeWebFetchTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes web fetch through runtime-provided web.fetch action.
 */
export async function executeWebFetchTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeWebFetchInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'web.fetch',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.web_fetch.completed',
    context: {
      url: normalized.url,
      maxBytes: normalized.maxBytes ?? null,
      timeoutMs: normalized.timeoutMs ?? null,
      status: typeof result.status === 'number' ? result.status : null,
      truncated: result.truncated === true,
    },
  });
  return result;
}

/**
 * Validates and normalizes one web fetch payload.
 */
export function normalizeWebFetchInput(
  args: {
    input: Record<string, unknown>;
  },
): WebFetchToolInput {
  const url = readRequiredHttpUrl({
    value: args.input.url,
    fieldName: 'url',
  });
  const maxBytes = readOptionalPositiveInteger({
    value: args.input.maxBytes,
    fieldName: 'maxBytes',
  });
  const timeoutMs = readOptionalPositiveInteger({
    value: args.input.timeoutMs,
    fieldName: 'timeoutMs',
  });
  return {
    url,
    maxBytes,
    timeoutMs,
  };
}

/**
 * Reads one required URL string and enforces http/https schemes.
 */
export function readRequiredHttpUrl(
  args: {
    value: unknown;
    fieldName: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new WebFetchToolInputError(`web_fetch input field "${args.fieldName}" is required.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.value);
  } catch {
    throw new WebFetchToolInputError(`web_fetch input field "${args.fieldName}" must be a valid URL.`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new WebFetchToolInputError(`web_fetch input field "${args.fieldName}" must use http or https.`);
  }

  return parsedUrl.toString();
}

/**
 * Reads one optional positive integer field.
 */
export function readOptionalPositiveInteger(
  args: {
    value: unknown;
    fieldName: string;
  },
): number | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'number' || !Number.isInteger(args.value) || args.value <= 0) {
    throw new WebFetchToolInputError(`web_fetch input field "${args.fieldName}" must be a positive integer.`);
  }

  return args.value;
}

/**
 * Exports the web fetch tool module contract consumed by the harness registry loader.
 */
export const tool = createWebFetchTool();
