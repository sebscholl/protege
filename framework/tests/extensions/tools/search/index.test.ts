import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSearchTool } from '@extensions/tools/search/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-search-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });
const testLogger = workspace.logger;

afterAll((): void => { workspace.cleanup(); });

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimeQuery = '';
let returnedMatchCount = 0;
let missingQueryError = '';

beforeAll(async (): Promise<void> => {
  const tool = createSearchTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      query: 'todo',
      path: 'engine',
      isRegex: false,
      maxResults: 5,
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
          runtimeQuery = String(args.payload.query ?? '');
          return {
            matches: [{ path: 'engine/a.ts', line: 1, column: 1, preview: 'todo' }],
          };
        },
      },
      logger: testLogger,
      db: testDb,
    },
  });
  returnedMatchCount = Array.isArray(result.matches) ? result.matches.length : 0;

  try {
    await tool.execute({
      input: {},
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ matches: [] }),
        },
        logger: testLogger,
        db: testDb,
      },
    });
  } catch (error) {
    missingQueryError = (error as Error).message;
  }
});

describe('search tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('search');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action file.search', () => {
    expect(runtimeAction).toBe('file.search');
  });

  it('forwards query payload to runtime', () => {
    expect(runtimeQuery).toBe('todo');
  });

  it('returns runtime matches payload unchanged', () => {
    expect(returnedMatchCount).toBe(1);
  });

  it('fails when required query is missing', () => {
    expect(missingQueryError.includes('query')).toBe(true);
  });
});
