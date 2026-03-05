import { beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayRuntimeActionInvoker,
  runWebSearchRuntimeAction,
} from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { mswIntercept } from '@tests/network/index';

let tavilyProvider = '';
let tavilyFirstTitle = '';
let tavilyTotalReturned = -1;
let perplexityProvider = '';
let perplexityFirstTitle = '';
let unsupportedProviderError = '';
let tavilyUnauthorizedError = '';
let invokerProvider = '';

function createWebSearchInboundMessage(): ReturnType<typeof createInboundMessage> {
  return createInboundMessage({
    personaId: 'persona-test',
    messageId: '<inbound@example.com>',
    threadId: 'thread-1',
    subject: 'Hello',
    text: 'Body',
  });
}

beforeAll(async (): Promise<void> => {
  mswIntercept({ fixtureKey: 'tavily/search/200' });
  const tavilyResult = await runWebSearchRuntimeAction({
    payload: {
      provider: 'tavily',
      query: 'open source email agents',
      maxResults: 5,
      apiKey: 'test-key',
      baseUrl: 'https://api.tavily.com',
    },
  });
  tavilyProvider = String(tavilyResult.provider ?? '');
  tavilyFirstTitle = String((tavilyResult.results as Array<Record<string, unknown>>)[0]?.title ?? '');
  tavilyTotalReturned = Number(tavilyResult.totalReturned ?? -1);

  mswIntercept({ fixtureKey: 'perplexity/search/200' });
  const perplexityResult = await runWebSearchRuntimeAction({
    payload: {
      provider: 'perplexity',
      query: 'email protocol history',
      maxResults: 5,
      apiKey: 'test-key',
      baseUrl: 'https://api.perplexity.ai',
    },
  });
  perplexityProvider = String(perplexityResult.provider ?? '');
  perplexityFirstTitle = String((perplexityResult.results as Array<Record<string, unknown>>)[0]?.title ?? '');

  try {
    await runWebSearchRuntimeAction({
      payload: {
        provider: 'unknown',
        query: 'anything',
        apiKey: 'test-key',
      },
    });
  } catch (error) {
    unsupportedProviderError = (error as Error).message;
  }

  mswIntercept({ fixtureKey: 'tavily/search/401' });
  try {
    await runWebSearchRuntimeAction({
      payload: {
        provider: 'tavily',
        query: 'unauthorized case',
        apiKey: 'bad-key',
        baseUrl: 'https://api.tavily.com',
      },
    });
  } catch (error) {
    tavilyUnauthorizedError = (error as Error).message;
  }

  const invoke = createGatewayRuntimeActionInvoker({
    message: createWebSearchInboundMessage(),
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
  });
  mswIntercept({ fixtureKey: 'perplexity/search/200' });
  const invokerResult = await invoke({
    action: 'web.search',
    payload: {
      provider: 'perplexity',
      query: 'invoker path test',
      maxResults: 5,
      apiKey: 'test-key',
      baseUrl: 'https://api.perplexity.ai',
    },
  });
  invokerProvider = String(invokerResult.provider ?? '');
});

describe('gateway runtime action invoker web.search action', () => {
  it('returns normalized provider field for tavily results', () => {
    expect(tavilyProvider).toBe('tavily');
  });

  it('returns normalized tavily result fields', () => {
    expect(tavilyFirstTitle).toBe('Tavily Result One');
  });

  it('returns normalized totalReturned for tavily results', () => {
    expect(tavilyTotalReturned).toBe(2);
  });

  it('returns normalized provider field for perplexity results', () => {
    expect(perplexityProvider).toBe('perplexity');
  });

  it('returns normalized perplexity result fields', () => {
    expect(perplexityFirstTitle).toBe('Perplexity Result One');
  });

  it('fails when provider is unsupported', () => {
    expect(unsupportedProviderError.includes('unsupported provider')).toBe(true);
  });

  it('fails on provider unauthorized responses', () => {
    expect(tavilyUnauthorizedError.includes('status 401')).toBe(true);
  });

  it('supports web.search through gateway runtime action invoker', () => {
    expect(invokerProvider).toBe('perplexity');
  });
});
