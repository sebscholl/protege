import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@protege-pack/toolkit';

/**
 * Represents accepted input payload for search tool execution.
 */
export type SearchToolInput = {
  query: string;
  path?: string;
  isRegex?: boolean;
  maxResults?: number;
};

/**
 * Represents one typed validation error for invalid search inputs.
 */
export class SearchToolInputError extends Error {}

/**
 * Creates one search tool definition with validated input execution behavior.
 */
export function createSearchTool(): HarnessToolDefinition {
  return {
    name: 'search',
    description: 'Search file contents and return structured match locations.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
        },
        path: {
          type: 'string',
        },
        isRegex: {
          type: 'boolean',
        },
        maxResults: {
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
      return executeSearchTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes search through runtime-provided file.search action.
 */
export async function executeSearchTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeSearchInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'file.search',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.search.completed',
    context: {
      query: normalized.query,
      path: normalized.path ?? null,
      isRegex: normalized.isRegex ?? false,
      maxResults: normalized.maxResults ?? null,
    },
  });
  return result;
}

/**
 * Validates and normalizes one search payload.
 */
export function normalizeSearchInput(
  args: {
    input: Record<string, unknown>;
  },
): SearchToolInput {
  const query = readRequiredString({
    value: args.input.query,
    fieldName: 'query',
  });
  const path = readOptionalString({
    value: args.input.path,
    fieldName: 'path',
  });
  const isRegex = readOptionalBoolean({
    value: args.input.isRegex,
    fieldName: 'isRegex',
  });
  const maxResults = readOptionalPositiveInteger({
    value: args.input.maxResults,
    fieldName: 'maxResults',
  });
  return {
    query,
    path,
    isRegex,
    maxResults,
  };
}

/**
 * Reads one required non-empty string field.
 */
export function readRequiredString(
  args: {
    value: unknown;
    fieldName: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new SearchToolInputError(`search input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one optional non-empty string field.
 */
export function readOptionalString(
  args: {
    value: unknown;
    fieldName: string;
  },
): string | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new SearchToolInputError(`search input field "${args.fieldName}" must be a non-empty string when provided.`);
  }

  return args.value;
}

/**
 * Reads one optional boolean field.
 */
export function readOptionalBoolean(
  args: {
    value: unknown;
    fieldName: string;
  },
): boolean | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'boolean') {
    throw new SearchToolInputError(`search input field "${args.fieldName}" must be a boolean.`);
  }

  return args.value;
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
    throw new SearchToolInputError(`search input field "${args.fieldName}" must be a positive integer.`);
  }

  return args.value;
}

/**
 * Exports the search tool module contract consumed by the harness registry loader.
 */
export const tool = createSearchTool();
