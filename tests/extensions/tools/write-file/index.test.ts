import { beforeAll, describe, expect, it } from 'vitest';

import { createWriteFileTool } from '@extensions/tools/write-file/index';

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimePath = '';
let runtimeContent = '';
let bytesWritten = -1;
let missingPathError = '';
let invalidContentError = '';

beforeAll(async (): Promise<void> => {
  const tool = createWriteFileTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      path: 'tmp/output.txt',
      content: 'hello',
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
          runtimeContent = String(args.payload.content ?? '');
          return {
            bytesWritten: 5,
          };
        },
      },
    },
  });
  bytesWritten = Number(result.bytesWritten ?? -1);

  try {
    await tool.execute({
      input: {
        content: 'missing path',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    missingPathError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        path: 'tmp/output.txt',
        content: 123,
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    invalidContentError = (error as Error).message;
  }
});

describe('write_file tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('write_file');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action file.write', () => {
    expect(runtimeAction).toBe('file.write');
  });

  it('forwards path payload to runtime', () => {
    expect(runtimePath).toBe('tmp/output.txt');
  });

  it('forwards content payload to runtime', () => {
    expect(runtimeContent).toBe('hello');
  });

  it('returns runtime write metadata unchanged', () => {
    expect(bytesWritten).toBe(5);
  });

  it('fails when required path is missing', () => {
    expect(missingPathError.includes('path')).toBe(true);
  });

  it('fails when content is not a string', () => {
    expect(invalidContentError.includes('content')).toBe(true);
  });
});
