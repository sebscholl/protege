import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege-toolkit';

/**
 * Represents accepted input payload for glob tool execution.
 */
export type GlobToolInput = {
  pattern: string;
  cwd?: string;
  maxResults?: number;
};

/**
 * Represents one typed validation error for invalid glob inputs.
 */
export class GlobToolInputError extends Error { }

/**
 * Creates one glob tool definition with validated input execution behavior.
 */
export function createGlobTool(): HarnessToolDefinition {
  return {
    name: 'glob',
    description: 'Find files that match one glob pattern.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pattern'],
      properties: {
        pattern: {
          type: 'string',
        },
        cwd: {
          type: 'string',
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
      return executeGlobTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes glob through runtime-provided file.glob action.
 */
export async function executeGlobTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeGlobInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'file.glob',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.glob.completed',
    context: {
      pattern: normalized.pattern,
      cwd: normalized.cwd ?? null,
    },
  });
  return result;
}

/**
 * Validates and normalizes one glob payload.
 */
export function normalizeGlobInput(
  args: {
    input: Record<string, unknown>;
  },
): GlobToolInput {
  const pattern = readRequiredString({
    value: args.input.pattern,
    fieldName: 'pattern',
  });
  const cwd = readOptionalString({
    value: args.input.cwd,
  });
  const maxResults = readOptionalPositiveInteger({
    value: args.input.maxResults,
    fieldName: 'maxResults',
  });
  return {
    pattern,
    cwd,
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
    throw new GlobToolInputError(`glob input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one optional non-empty string field.
 */
export function readOptionalString(
  args: {
    value: unknown;
  },
): string | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new GlobToolInputError('glob input field "cwd" must be a non-empty string when provided.');
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
    throw new GlobToolInputError(`glob input field \"${args.fieldName}\" must be a positive integer.`);
  }

  return args.value;
}

/**
 * Exports the glob tool module contract consumed by the harness registry loader.
 */
export const tool = createGlobTool();
