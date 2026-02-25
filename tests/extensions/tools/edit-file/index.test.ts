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
});
