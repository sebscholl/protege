import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createWebSearchTool,
  defaultWebSearchToolConfig,
  mergeRecordWithOverride,
  resolveWebSearchToolConfig,
} from '@extensions/tools/web-search/index';

let toolName = '';
let runtimeAction = '';
let runtimeProvider = '';
let runtimeQuery = '';
let runtimeMaxResults = -1;
let runtimeApiKey = '';
let runtimeStatus = -1;
let missingQueryError = '';
let missingEnvError = '';
let overriddenConfigProvider = '';
let overriddenConfigBaseUrl = '';
let mergeArrayLength = -1;
let mergeNestedOverrideValue = '';

beforeAll(async (): Promise<void> => {
  process.env.PERPLEXITY_API_KEY = 'perplexity-test-key';
  process.env.TAVILY_API_KEY = 'tavily-test-key';

  const tool = createWebSearchTool();
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
      configOverride: {
        providers: {
          perplexity: {
            apiKeyEnv: 'NOT_SET_WEB_SEARCH_KEY',
          },
        },
      },
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

  const overriddenConfig = resolveWebSearchToolConfig({
    configOverride: {
      provider: 'tavily',
      providers: {
        tavily: {
          baseUrl: 'https://example.tavily.local',
        },
      },
    },
  });
  overriddenConfigProvider = overriddenConfig.provider;
  overriddenConfigBaseUrl = String(overriddenConfig.providers.tavily.baseUrl ?? '');

  const mergedRecord = mergeRecordWithOverride({
    base: {
      features: ['one', 'two'],
      nested: {
        value: 'base',
      },
    },
    override: {
      features: ['override'],
      nested: {
        value: 'changed',
      },
    },
  });
  mergeArrayLength = Array.isArray(mergedRecord.features) ? mergedRecord.features.length : -1;
  mergeNestedOverrideValue = String((mergedRecord.nested as Record<string, unknown>).value ?? '');
});

afterAll((): void => {
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

describe('web_search tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('web_search');
  });

  it('invokes runtime action web.search', () => {
    expect(runtimeAction).toBe('web.search');
  });

  it('uses perplexity as default provider', () => {
    expect(runtimeProvider).toBe('perplexity');
  });

  it('forwards query to runtime payload', () => {
    expect(runtimeQuery).toBe('latest ai agents');
  });

  it('uses defaultMaxResults from default config', () => {
    expect(runtimeMaxResults).toBe(defaultWebSearchToolConfig.defaultMaxResults);
  });

  it('resolves provider API key from default environment variable', () => {
    expect(runtimeApiKey).toBe('perplexity-test-key');
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

  it('applies manifest override provider value', () => {
    expect(overriddenConfigProvider).toBe('tavily');
  });

  it('deep merges nested provider overrides over defaults', () => {
    expect(overriddenConfigBaseUrl).toBe('https://example.tavily.local');
  });

  it('replaces arrays during deep merge', () => {
    expect(mergeArrayLength).toBe(1);
  });

  it('overrides nested scalar fields during deep merge', () => {
    expect(mergeNestedOverrideValue).toBe('changed');
  });
});
