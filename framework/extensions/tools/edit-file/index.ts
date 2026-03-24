import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege-toolkit';

/**
 * Represents accepted input payload for edit_file tool execution.
 */
export type EditFileToolInput = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
};

/**
 * Represents one typed validation error for invalid edit_file inputs.
 */
export class EditFileToolInputError extends Error { }

/**
 * Creates one edit_file tool definition using line-range replacement semantics.
 */
export function createEditFileTool(): HarnessToolDefinition {
  return {
    name: 'edit_file',
    description: 'Replace lines in one UTF-8 text file. Specify the inclusive line range to replace and the new content. Read the file first to confirm line numbers.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'startLine', 'endLine', 'content'],
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit.',
        },
        startLine: {
          type: 'integer',
          description: 'First line to replace (1-based, inclusive).',
        },
        endLine: {
          type: 'integer',
          description: 'Last line to replace (1-based, inclusive).',
        },
        content: {
          type: 'string',
          description: 'Replacement content. May be empty to delete lines.',
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => {
      return executeEditFileTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes edit_file through runtime-provided file.edit action.
 */
export async function executeEditFileTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeEditFileInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'file.edit',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.edit_file.completed',
    context: {
      path: normalized.path,
      startLine: normalized.startLine,
      endLine: normalized.endLine,
    },
  });
  return result;
}

/**
 * Validates and normalizes one edit_file payload into line-range fields.
 */
export function normalizeEditFileInput(
  args: {
    input: Record<string, unknown>;
  },
): EditFileToolInput {
  const path = readRequiredString({
    value: args.input.path,
    fieldName: 'path',
  });
  const startLine = readRequiredInteger({
    value: args.input.startLine,
    fieldName: 'startLine',
  });
  const endLine = readRequiredInteger({
    value: args.input.endLine,
    fieldName: 'endLine',
  });
  if (startLine > endLine) {
    throw new EditFileToolInputError('edit_file startLine must not be greater than endLine.');
  }
  const content = readRequiredContent({
    value: args.input.content,
    fieldName: 'content',
  });

  return { path, startLine, endLine, content };
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
    throw new EditFileToolInputError(`edit_file input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one required string field which may be empty.
 */
export function readRequiredContent(
  args: {
    value: unknown;
    fieldName: string;
  },
): string {
  if (typeof args.value !== 'string') {
    throw new EditFileToolInputError(`edit_file input field "${args.fieldName}" must be a string.`);
  }

  return args.value;
}

/**
 * Reads one required integer field.
 */
export function readRequiredInteger(
  args: {
    value: unknown;
    fieldName: string;
  },
): number {
  if (typeof args.value !== 'number' || !Number.isInteger(args.value)) {
    throw new EditFileToolInputError(`edit_file input field "${args.fieldName}" must be an integer.`);
  }

  return args.value;
}

/**
 * Exports the edit-file tool module contract consumed by the harness registry loader.
 */
export const tool = createEditFileTool();
