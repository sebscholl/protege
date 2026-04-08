import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createReadFileTool } from '@extensions/tools/read-file/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-read-file-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });
const testLogger = workspace.logger;

afterAll((): void => { workspace.cleanup(); });

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimePath = '';
let readContent = '';
let missingPathError = '';

beforeAll(async (): Promise<void> => {
  const tool = createReadFileTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      path: 'README.md',
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
          return {
            content: '# hello',
          };
        },
      },
      logger: testLogger,
      db: testDb,
    },
  });
  readContent = String(result.content ?? '');

  try {
    await tool.execute({
      input: {},
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
        logger: testLogger,
        db: testDb,
      },
    });
  } catch (error) {
    missingPathError = (error as Error).message;
  }
});

describe('read_file tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('read_file');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action file.read', () => {
    expect(runtimeAction).toBe('file.read');
  });

  it('forwards input path payload to runtime', () => {
    expect(runtimePath).toBe('README.md');
  });

  it('returns runtime content payload unchanged', () => {
    expect(readContent).toBe('# hello');
  });

  it('fails when required path is missing', () => {
    expect(missingPathError.includes('path')).toBe(true);
  });
});
