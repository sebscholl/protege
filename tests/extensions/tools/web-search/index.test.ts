import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createWebSearchTool } from '@extensions/tools/web-search/index';

let tempRootPath = '';
let tavilyConfigPath = '';
let missingEnvConfigPath = '';
let toolName = '';
let runtimeAction = '';
let runtimeProvider = '';
let runtimeQuery = '';
let runtimeMaxResults = -1;
let runtimeApiKey = '';
let runtimeStatus = -1;
let missingQueryError = '';
let missingEnvError = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-web-search-tool-'));
  tavilyConfigPath = join(tempRootPath, 'web-search.config.json');
  missingEnvConfigPath = join(tempRootPath, 'web-search-missing-env.config.json');
  writeFileSync(tavilyConfigPath, JSON.stringify({
    provider: 'tavily',
    defaultMaxResults: 6,
    providers: {
      tavily: {
        apiKeyEnv: 'TAVILY_API_KEY',
        baseUrl: 'https://api.tavily.com',
      },
      perplexity: {
        apiKeyEnv: 'PERPLEXITY_API_KEY',
        baseUrl: 'https://api.perplexity.ai',
      },
    },
  }), 'utf8');
  writeFileSync(missingEnvConfigPath, JSON.stringify({
    provider: 'tavily',
    providers: {
      tavily: {
        apiKeyEnv: 'NOT_SET_WEB_SEARCH_KEY',
      },
    },
  }), 'utf8');

  process.env.TAVILY_API_KEY = 'tavily-test-key';
  const tool = createWebSearchTool({
    configPath: tavilyConfigPath,
  });
  toolName = tool.name;

  const result = await tool.execute({
    input: {
      query: 'latest ai agents',
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
          runtimeProvider = String(args.payload.provider ?? '');
          runtimeQuery = String(args.payload.query ?? '');
          runtimeMaxResults = Number(args.payload.maxResults ?? -1);
          runtimeApiKey = String(args.payload.apiKey ?? '');
          return {
            status: 200,
          };
        },
      },
    },
  });
  runtimeStatus = Number(result.status ?? -1);

  try {
    await tool.execute({
      input: {},
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    missingQueryError = (error as Error).message;
  }

  try {
    await createWebSearchTool({
      configPath: missingEnvConfigPath,
    }).execute({
      input: {
        query: 'hello',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    missingEnvError = (error as Error).message;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('web_search tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('web_search');
  });

  it('invokes runtime action web.search', () => {
    expect(runtimeAction).toBe('web.search');
  });

  it('forwards configured provider to runtime payload', () => {
    expect(runtimeProvider).toBe('tavily');
  });

  it('forwards query to runtime payload', () => {
    expect(runtimeQuery).toBe('latest ai agents');
  });

  it('uses defaultMaxResults from config when input omits maxResults', () => {
    expect(runtimeMaxResults).toBe(6);
  });

  it('resolves provider API key from configured environment variable', () => {
    expect(runtimeApiKey).toBe('tavily-test-key');
  });

  it('returns runtime result fields unchanged', () => {
    expect(runtimeStatus).toBe(200);
  });

  it('fails when required query input is missing', () => {
    expect(missingQueryError.includes('query')).toBe(true);
  });

  it('fails when configured provider environment key is missing', () => {
    expect(missingEnvError.includes('NOT_SET_WEB_SEARCH_KEY')).toBe(true);
  });
});
