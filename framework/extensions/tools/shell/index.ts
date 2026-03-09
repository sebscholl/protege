import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@protege-pack/toolkit';

/**
 * Represents accepted input payload for shell tool execution.
 */
export type ShellToolInput = {
  command: string;
  timeoutMs?: number;
  workdir?: string;
  maxOutputChars?: number;
};

/**
 * Represents one typed validation error for invalid shell inputs.
 */
export class ShellToolInputError extends Error {}

/**
 * Creates one shell tool definition with validated input execution behavior.
 */
export function createShellTool(): HarnessToolDefinition {
  return {
    name: 'shell',
    description: 'Execute one non-interactive shell command and return structured stdout/stderr results.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['command'],
      properties: {
        command: {
          type: 'string',
        },
        timeoutMs: {
          type: 'integer',
          minimum: 1,
        },
        workdir: {
          type: 'string',
        },
        maxOutputChars: {
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
      return executeShellTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes shell through runtime-provided shell.exec action.
 */
export async function executeShellTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const normalized = normalizeShellInput({
    input: args.input,
  });
  const result = await args.context.runtime.invoke({
    action: 'shell.exec',
    payload: normalized,
  });
  args.context.logger?.info({
    event: 'harness.tool.shell.completed',
    context: {
      command: normalized.command,
      timeoutMs: normalized.timeoutMs ?? null,
      workdir: normalized.workdir ?? null,
      maxOutputChars: normalized.maxOutputChars ?? null,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : null,
    },
  });
  return result;
}

/**
 * Validates and normalizes one shell payload.
 */
export function normalizeShellInput(
  args: {
    input: Record<string, unknown>;
  },
): ShellToolInput {
  const command = readRequiredString({
    value: args.input.command,
    fieldName: 'command',
  });
  const timeoutMs = readOptionalPositiveInteger({
    value: args.input.timeoutMs,
    fieldName: 'timeoutMs',
  });
  const workdir = readOptionalString({
    value: args.input.workdir,
    fieldName: 'workdir',
  });
  const maxOutputChars = readOptionalPositiveInteger({
    value: args.input.maxOutputChars,
    fieldName: 'maxOutputChars',
  });
  return {
    command,
    timeoutMs,
    workdir,
    maxOutputChars,
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
    throw new ShellToolInputError(`shell input field "${args.fieldName}" is required.`);
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
    throw new ShellToolInputError(`shell input field "${args.fieldName}" must be a non-empty string when provided.`);
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
    throw new ShellToolInputError(`shell input field "${args.fieldName}" must be a positive integer.`);
  }

  return args.value;
}

/**
 * Exports the shell tool module contract consumed by the harness registry loader.
 */
export const tool = createShellTool();
