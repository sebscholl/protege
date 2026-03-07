import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege/toolkit';

/**
 * Represents accepted input payload for write_file tool execution.
 */
export type WriteFileToolInput = {
  path: string;
  content: string;
};

/**
 * Represents one typed validation error for invalid write_file inputs.
 */
export class WriteFileToolInputError extends Error {}

/**
 * Creates one write_file tool definition with validated input execution behavior.
 */
export function createWriteFileTool(): HarnessToolDefinition {
  return {
    name: 'write_file',
    description: 'Create or overwrite one UTF-8 text file.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content'],
      properties: {
        path: {
          type: 'string',
        },
        content: {
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
      return executeWriteFileTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes write_file through runtime-provided file.write action.
 */
export async function executeWriteFileTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeWriteFileInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'file.write',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.write_file.completed',
    context: {
      path: normalized.path,
    },
  });
  return result;
}

/**
 * Validates and normalizes one write_file payload.
 */
export function normalizeWriteFileInput(
  args: {
    input: Record<string, unknown>;
  },
): WriteFileToolInput {
  const path = readRequiredString({
    value: args.input.path,
    fieldName: 'path',
  });
  const content = readContentString({
    value: args.input.content,
  });
  return {
    path,
    content,
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
    throw new WriteFileToolInputError(`write_file input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one required string field for file content.
 */
export function readContentString(
  args: {
    value: unknown;
  },
): string {
  if (typeof args.value !== 'string') {
    throw new WriteFileToolInputError('write_file input field "content" must be a string.');
  }

  return args.value;
}

/**
 * Exports the write-file tool module contract consumed by the harness registry loader.
 */
export const tool = createWriteFileTool();
