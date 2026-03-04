import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@engine/harness/tools/contract';

/**
 * Represents accepted input payload for read_file tool execution.
 */
export type ReadFileToolInput = {
  path: string;
};

/**
 * Represents one typed validation error for invalid read_file inputs.
 */
export class ReadFileToolInputError extends Error {}

/**
 * Creates one read_file tool definition with validated input execution behavior.
 */
export function createReadFileTool(): HarnessToolDefinition {
  return {
    name: 'read_file',
    description: 'Read full UTF-8 text content from one file path.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => {
      return executeReadFileTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes read_file through runtime-provided file.read action.
 */
export async function executeReadFileTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeReadFileInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'file.read',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.read_file.completed',
    context: {
      path: normalized.path,
    },
  });
  return result;
}

/**
 * Validates and normalizes one read_file payload.
 */
export function normalizeReadFileInput(
  args: {
    input: Record<string, unknown>;
  },
): ReadFileToolInput {
  const path = readRequiredString({
    value: args.input.path,
    fieldName: 'path',
  });
  return {
    path,
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
    throw new ReadFileToolInputError(`read_file input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Exports the read-file tool module contract consumed by the harness registry loader.
 */
export const tool = createReadFileTool();
