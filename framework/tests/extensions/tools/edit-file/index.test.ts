import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEditFileTool } from '@extensions/tools/edit-file/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-edit-file-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });
const testLogger = workspace.logger;

afterAll((): void => { workspace.cleanup(); });

let toolName = '';
let toolDescription = '';
let schemaType = '';
let requiredFields: string[] = [];
let runtimeAction = '';
let runtimePath = '';
let runtimeStartLine = -1;
let runtimeEndLine = -1;
let runtimeContent = '';
let removedLines = -1;
let insertedLines = -1;
let missingStartLineError = '';
let missingEndLineError = '';
let invalidStartLineTypeError = '';
let startAfterEndError = '';
let missingContentError = '';

beforeAll(async (): Promise<void> => {
  const tool = createEditFileTool();
  toolName = tool.name;
  toolDescription = tool.description;
  schemaType = String(tool.inputSchema.type ?? '');
  requiredFields = Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required.filter((value): value is string => typeof value === 'string')
    : [];

  const result = await tool.execute({
    input: {
      path: 'src/app.ts',
      startLine: 5,
      endLine: 7,
      content: 'function hello() {\n  return "world";\n}',
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
          runtimeStartLine = Number(args.payload.startLine ?? -1);
          runtimeEndLine = Number(args.payload.endLine ?? -1);
          runtimeContent = String(args.payload.content ?? '');
          return {
            removedLines: 3,
            insertedLines: 3,
          };
        },
      },
      logger: testLogger,
      db: testDb,
    },
  });
  removedLines = Number(result.removedLines ?? -1);
  insertedLines = Number(result.insertedLines ?? -1);

  try {
    await tool.execute({
      input: { path: 'src/app.ts', endLine: 5, content: 'new' },
      context: { runtime: { invoke: async (): Promise<Record<string, unknown>> => ({}) }, logger: testLogger, db: testDb },
    });
  } catch (error) {
    missingStartLineError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: { path: 'src/app.ts', startLine: 5, content: 'new' },
      context: { runtime: { invoke: async (): Promise<Record<string, unknown>> => ({}) }, logger: testLogger, db: testDb },
    });
  } catch (error) {
    missingEndLineError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: { path: 'src/app.ts', startLine: 'five', endLine: 7, content: 'new' },
      context: { runtime: { invoke: async (): Promise<Record<string, unknown>> => ({}) }, logger: testLogger, db: testDb },
    });
  } catch (error) {
    invalidStartLineTypeError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: { path: 'src/app.ts', startLine: 10, endLine: 5, content: 'new' },
      context: { runtime: { invoke: async (): Promise<Record<string, unknown>> => ({}) }, logger: testLogger, db: testDb },
    });
  } catch (error) {
    startAfterEndError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: { path: 'src/app.ts', startLine: 5, endLine: 7 },
      context: { runtime: { invoke: async (): Promise<Record<string, unknown>> => ({}) }, logger: testLogger, db: testDb },
    });
  } catch (error) {
    missingContentError = (error as Error).message;
  }
});

describe('edit_file tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('edit_file');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('requires path, startLine, endLine, and content fields', () => {
    expect(requiredFields).toEqual(['path', 'startLine', 'endLine', 'content']);
  });

  it('describes line-range replacement behavior', () => {
    expect(toolDescription.includes('line')).toBe(true);
  });

  it('invokes runtime action file.edit', () => {
    expect(runtimeAction).toBe('file.edit');
  });

  it('forwards path to runtime payload', () => {
    expect(runtimePath).toBe('src/app.ts');
  });

  it('forwards startLine to runtime payload', () => {
    expect(runtimeStartLine).toBe(5);
  });

  it('forwards endLine to runtime payload', () => {
    expect(runtimeEndLine).toBe(7);
  });

  it('forwards content to runtime payload', () => {
    expect(runtimeContent).toBe('function hello() {\n  return "world";\n}');
  });

  it('returns runtime removedLines metadata', () => {
    expect(removedLines).toBe(3);
  });

  it('returns runtime insertedLines metadata', () => {
    expect(insertedLines).toBe(3);
  });

  it('fails when startLine is missing', () => {
    expect(missingStartLineError.includes('startLine')).toBe(true);
  });

  it('fails when endLine is missing', () => {
    expect(missingEndLineError.includes('endLine')).toBe(true);
  });

  it('fails when startLine is not an integer', () => {
    expect(invalidStartLineTypeError.includes('startLine')).toBe(true);
  });

  it('fails when startLine is greater than endLine', () => {
    expect(startAfterEndError.includes('startLine')).toBe(true);
  });

  it('fails when content is missing', () => {
    expect(missingContentError.includes('content')).toBe(true);
  });
});
