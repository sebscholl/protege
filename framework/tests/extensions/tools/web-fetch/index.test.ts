import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createWebFetchTool } from '@extensions/tools/web-fetch/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

const workspace = createTestWorkspaceFromFixture({ fixtureName: 'minimal-protege', tempPrefix: 'protege-web-fetch-', chdir: false });
const testDb = workspace.openPersonaDb({ personaId: 'test' });
const testLogger = workspace.logger;

afterAll((): void => { workspace.cleanup(); });

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimeUrl = '';
let runtimeMaxBytes = -1;
let runtimeTimeoutMs = -1;
let responseStatus = -1;
let missingUrlError = '';
let invalidSchemeError = '';

beforeAll(async (): Promise<void> => {
  const tool = createWebFetchTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      url: 'https://example.com/article',
      maxBytes: 2048,
      timeoutMs: 3000,
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
          runtimeUrl = String(args.payload.url ?? '');
          runtimeMaxBytes = Number(args.payload.maxBytes ?? -1);
          runtimeTimeoutMs = Number(args.payload.timeoutMs ?? -1);
          return {
            status: 200,
            text: 'ok',
          };
        },
      },
      logger: testLogger,
      db: testDb,
    },
  });
  responseStatus = Number(result.status ?? -1);

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
    missingUrlError = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        url: 'file:///tmp/secret.txt',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
        logger: testLogger,
        db: testDb,
      },
    });
  } catch (error) {
    invalidSchemeError = (error as Error).message;
  }
});

describe('web_fetch tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('web_fetch');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action web.fetch', () => {
    expect(runtimeAction).toBe('web.fetch');
  });

  it('forwards url payload to runtime', () => {
    expect(runtimeUrl).toBe('https://example.com/article');
  });

  it('forwards maxBytes payload to runtime', () => {
    expect(runtimeMaxBytes).toBe(2048);
  });

  it('forwards timeoutMs payload to runtime', () => {
    expect(runtimeTimeoutMs).toBe(3000);
  });

  it('returns runtime web.fetch metadata unchanged', () => {
    expect(responseStatus).toBe(200);
  });

  it('fails when required url is missing', () => {
    expect(missingUrlError.includes('url')).toBe(true);
  });

  it('fails when url scheme is not http or https', () => {
    expect(invalidSchemeError.includes('http')).toBe(true);
  });
});
