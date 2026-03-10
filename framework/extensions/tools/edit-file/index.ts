import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege-toolkit';

import { normalizeToolTextContent } from '../shared/content-normalization';

/**
 * Represents accepted input payload for edit_file tool execution.
 */
export type EditFileToolInput = {
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
};

/**
 * Represents one typed validation error for invalid edit_file inputs.
 */
export class EditFileToolInputError extends Error { }

/**
 * Creates one edit_file tool definition with validated input execution behavior.
 */
export function createEditFileTool(): HarnessToolDefinition {
  return {
    name: 'edit_file',
    description: 'Edit one UTF-8 text file using literal text replacement.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'oldText', 'newText'],
      properties: {
        path: {
          type: 'string',
        },
        oldText: {
          type: 'string',
        },
        newText: {
          type: 'string',
        },
        replaceAll: {
          type: 'boolean',
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
      replaceAll: normalized.replaceAll ?? false,
    },
  });
  return result;
}

/**
 * Validates and normalizes one edit_file payload.
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
  const oldText = readRequiredString({
    value: args.input.oldText,
    fieldName: 'oldText',
  });
  const newText = normalizeToolTextContent({
    content: readContentString({
      value: args.input.newText,
      fieldName: 'newText',
    }),
  });
  const normalizedOldText = normalizeToolTextContent({
    content: oldText,
  });
  const replaceAll = readOptionalBoolean({
    value: args.input.replaceAll,
    fieldName: 'replaceAll',
  });
  return {
    path,
    oldText: normalizedOldText,
    newText,
    replaceAll,
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
    throw new EditFileToolInputError(`edit_file input field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one required string field which may be empty.
 */
export function readContentString(
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
    throw new EditFileToolInputError(`edit_file input field "${args.fieldName}" must be a boolean.`);
  }

  return args.value;
}

/**
 * Exports the edit-file tool module contract consumed by the harness registry loader.
 */
export const tool = createEditFileTool();
