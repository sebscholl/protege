import { beforeAll, describe, expect, it } from 'vitest';

import { createEditFileTool } from '@extensions/tools/edit-file/index';

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimePath = '';
let runtimeOldText = '';
let runtimeNewText = '';
let runtimeReplaceAll = false;
let appliedEdits = -1;
let missingOldTextError = '';
let invalidReplaceAllError = '';
let decodedQuotedOldText = '';
let decodedQuotedNewText = '';
let decodedUnquotedOldText = '';
let decodedUnquotedNewText = '';
let preservedEscapedOldText = '';
let preservedEscapedNewText = '';

beforeAll(async (): Promise<void> => {
  const tool = createEditFileTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      path: 'README.md',
      oldText: 'old',
      newText: 'new',
      replaceAll: true,
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          runtimeAction = args.action;
          runtimePath = String(args.payload.path ?? '');
          runtimeOldText = String(args.payload.oldText ?? '');
          runtimeNewText = String(args.payload.newText ?? '');
          runtimeReplaceAll = Boolean(args.payload.replaceAll);
          return {
            appliedEdits: 2,
          };
        },
      },
    },
  });
  appliedEdits = Number(result.appliedEdits ?? -1);

  try {
    await tool.execute({
      input: {
        path: 'README.md',
        newText: 'new',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    missingOldTextError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        path: 'README.md',
        oldText: 'old',
        newText: 'new',
        replaceAll: 'yes',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    invalidReplaceAllError = (error as Error).message;
  }

  await tool.execute({
    input: {
      path: 'README.md',
      oldText: '"line one\\nline two"',
      newText: '"line one\\nline done"',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          decodedQuotedOldText = String(args.payload.oldText ?? '');
          decodedQuotedNewText = String(args.payload.newText ?? '');
          return {
            appliedEdits: 1,
          };
        },
      },
    },
  });

  await tool.execute({
    input: {
      path: 'README.md',
      oldText: 'line one\\nline two\\nline three',
      newText: 'line one\\nline changed\\nline three',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          decodedUnquotedOldText = String(args.payload.oldText ?? '');
          decodedUnquotedNewText = String(args.payload.newText ?? '');
          return {
            appliedEdits: 1,
          };
        },
      },
    },
  });

  await tool.execute({
    input: {
      path: 'README.md',
      oldText: 'const literal = "\\\\n";',
      newText: 'const literal = "\\\\n changed";',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          preservedEscapedOldText = String(args.payload.oldText ?? '');
          preservedEscapedNewText = String(args.payload.newText ?? '');
          return {
            appliedEdits: 1,
          };
        },
      },
    },
  });
});

describe('edit_file tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('edit_file');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action file.edit', () => {
    expect(runtimeAction).toBe('file.edit');
  });

  it('forwards path payload to runtime', () => {
    expect(runtimePath).toBe('README.md');
  });

  it('forwards oldText payload to runtime', () => {
    expect(runtimeOldText).toBe('old');
  });

  it('forwards newText payload to runtime', () => {
    expect(runtimeNewText).toBe('new');
  });

  it('forwards replaceAll payload to runtime', () => {
    expect(runtimeReplaceAll).toBe(true);
  });

  it('returns runtime edit metadata unchanged', () => {
    expect(appliedEdits).toBe(2);
  });

  it('fails when required oldText is missing', () => {
    expect(missingOldTextError.includes('oldText')).toBe(true);
  });

  it('fails when replaceAll is not boolean', () => {
    expect(invalidReplaceAllError.includes('replaceAll')).toBe(true);
  });

  it('decodes quoted JSON-string oldText payloads before runtime invoke', () => {
    expect(decodedQuotedOldText).toBe('line one\nline two');
  });

  it('decodes quoted JSON-string newText payloads before runtime invoke', () => {
    expect(decodedQuotedNewText).toBe('line one\nline done');
  });

  it('decodes unquoted escaped oldText payloads when likely double-escaped', () => {
    expect(decodedUnquotedOldText).toBe('line one\nline two\nline three');
  });

  it('decodes unquoted escaped newText payloads when likely double-escaped', () => {
    expect(decodedUnquotedNewText).toBe('line one\nline changed\nline three');
  });

  it('preserves oldText escaped literals when decode heuristic does not apply', () => {
    expect(preservedEscapedOldText).toBe('const literal = "\\\\n";');
  });

  it('preserves newText escaped literals when decode heuristic does not apply', () => {
    expect(preservedEscapedNewText).toBe('const literal = "\\\\n changed";');
  });
});
