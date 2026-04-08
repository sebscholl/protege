import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGlobTool } from '@extensions/tools/glob/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-glob-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });
const testLogger = workspace.logger;

afterAll((): void => { workspace.cleanup(); });

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimePattern = '';
let runtimeMaxResults = -1;
let returnedPathCount = 0;
let missingPatternError = '';
let invalidMaxResultsError = '';

beforeAll(async (): Promise<void> => {
  const tool = createGlobTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      pattern: '**/*.md',
      maxResults: 10,
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
          runtimePattern = String(args.payload.pattern ?? '');
          runtimeMaxResults = Number(args.payload.maxResults ?? -1);
          return {
            paths: ['README.md', 'guide/chat.md'],
          };
        },
      },
      logger: testLogger,
      db: testDb,
    },
  });
  returnedPathCount = Array.isArray(result.paths) ? result.paths.length : 0;

  try {
    await tool.execute({
      input: {},
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ paths: [] }),
        },
        logger: testLogger,
        db: testDb,
      },
    });
  } catch (error) {
    missingPatternError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        pattern: '**/*.md',
        maxResults: 0,
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ paths: [] }),
        },
        logger: testLogger,
        db: testDb,
      },
    });
  } catch (error) {
    invalidMaxResultsError = (error as Error).message;
  }
});

describe('glob tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('glob');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action file.glob', () => {
    expect(runtimeAction).toBe('file.glob');
  });

  it('forwards pattern payload to runtime', () => {
    expect(runtimePattern).toBe('**/*.md');
  });

  it('forwards maxResults payload to runtime', () => {
    expect(runtimeMaxResults).toBe(10);
  });

  it('returns runtime paths payload unchanged', () => {
    expect(returnedPathCount).toBe(2);
  });

  it('fails when required pattern is missing', () => {
    expect(missingPatternError.includes('pattern')).toBe(true);
  });

  it('fails when maxResults is not a positive integer', () => {
    expect(invalidMaxResultsError.includes('maxResults')).toBe(true);
  });
});
