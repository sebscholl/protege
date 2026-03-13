import { readOptionalRuntimePositiveInteger, readRequiredRuntimeString } from '../shared/runtime-action-helpers';

/**
 * Represents one normalized web-search result entry returned to tools.
 */
export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
};

/**
 * Runs one web.search runtime action using the configured provider adapter.
 */
export async function runWebSearchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    fetchFn?: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const provider = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'provider',
    actionName: 'web.search',
  });
  const query = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'query',
    actionName: 'web.search',
  });
  const apiKey = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'apiKey',
    actionName: 'web.search',
  });
  const maxResults = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxResults',
    actionName: 'web.search',
  }) ?? 8;
  const baseUrl = typeof args.payload.baseUrl === 'string' && args.payload.baseUrl.trim().length > 0
    ? args.payload.baseUrl
    : undefined;
  const fetchImpl = args.fetchFn ?? fetch;

  if (provider === 'tavily') {
    return runTavilyWebSearch({
      query,
      maxResults,
      apiKey,
      baseUrl: baseUrl ?? 'https://api.tavily.com',
      fetchFn: fetchImpl,
    });
  }
  if (provider === 'perplexity') {
    return runPerplexityWebSearch({
      query,
      maxResults,
      apiKey,
      baseUrl: baseUrl ?? 'https://api.perplexity.ai',
      fetchFn: fetchImpl,
    });
  }

  throw new Error(`web.search unsupported provider: ${provider}`);
}

/**
 * Executes one Tavily-backed web search and normalizes result payload fields.
 */
export async function runTavilyWebSearch(
  args: {
    query: string;
    maxResults: number;
    apiKey: string;
    baseUrl: string;
    fetchFn: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const response = await args.fetchFn(`${args.baseUrl}/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      query: args.query,
      max_results: args.maxResults,
    }),
  });
  if (!response.ok) {
    throw new Error(`web.search tavily failed with status ${response.status}.`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const normalized = rawResults
    .map((item) => normalizeTavilyResult({
      value: item,
    }))
    .filter((item): item is WebSearchResult => item !== undefined);
  return {
    provider: 'tavily',
    query: args.query,
    results: normalized.slice(0, args.maxResults),
    truncated: normalized.length > args.maxResults,
    totalReturned: normalized.length,
  };
}

/**
 * Normalizes one Tavily response entry into shared web-search result shape.
 */
export function normalizeTavilyResult(
  args: {
    value: unknown;
  },
): WebSearchResult | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  if (typeof record.title !== 'string' || typeof record.url !== 'string') {
    return undefined;
  }

  return {
    title: record.title,
    url: record.url,
    snippet: typeof record.content === 'string' ? record.content : '',
    publishedAt: typeof record.published_date === 'string' ? record.published_date : undefined,
    source: typeof record.source === 'string' ? record.source : undefined,
  };
}

/**
 * Executes one Perplexity-backed web search and normalizes result payload fields.
 */
export async function runPerplexityWebSearch(
  args: {
    query: string;
    maxResults: number;
    apiKey: string;
    baseUrl: string;
    fetchFn: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const response = await args.fetchFn(`${args.baseUrl}/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      query: args.query,
      max_results: args.maxResults,
    }),
  });
  if (!response.ok) {
    throw new Error(`web.search perplexity failed with status ${response.status}.`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const normalized = rawResults
    .map((item) => normalizePerplexityResult({
      value: item,
    }))
    .filter((item): item is WebSearchResult => item !== undefined);
  return {
    provider: 'perplexity',
    query: args.query,
    results: normalized.slice(0, args.maxResults),
    truncated: normalized.length > args.maxResults,
    totalReturned: normalized.length,
  };
}

/**
 * Normalizes one Perplexity response entry into shared web-search result shape.
 */
export function normalizePerplexityResult(
  args: {
    value: unknown;
  },
): WebSearchResult | undefined {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return undefined;
  }

  const record = args.value as Record<string, unknown>;
  if (typeof record.title !== 'string' || typeof record.url !== 'string') {
    return undefined;
  }

  return {
    title: record.title,
    url: record.url,
    snippet: typeof record.snippet === 'string' ? record.snippet : '',
    publishedAt: typeof record.published_at === 'string' ? record.published_at : undefined,
    source: typeof record.source === 'string' ? record.source : undefined,
  };
}
