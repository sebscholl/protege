import type { HarnessProviderGenerateRequest } from '@engine/harness/providers/contract';

import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/providers/contract';
import {
  buildOpenRouterChatMessage,
  createOpenRouterProviderAdapter,
  generateWithOpenRouter,
} from '@extensions/providers/openrouter';
import { mswIntercept } from '@tests/network/index';

const request: HarnessProviderGenerateRequest = {
  modelId: 'openrouter/openai/gpt-4.1-mini',
  messages: [
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ],
};

let successText = '';
let successToolCallName = '';
let failureCode = '';
let unsupportedProviderCode = '';
let invalidToolArgumentsCode = '';
let emptyAssistantContent = '__unset__';

beforeAll(async (): Promise<void> => {
  mswIntercept({ fixtureKey: 'openrouter/chat-completions/200' });
  const adapter = createOpenRouterProviderAdapter({
    config: {
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
  });
  const success = await adapter.generate({ request });
  successText = success.text ?? '';

  mswIntercept({ fixtureKey: 'openrouter/chat-completions/200-tool-call' });
  const toolCallResponse = await adapter.generate({
    request: {
      ...request,
      tools: [{
        name: 'send_email',
        description: 'Send outbound mail.',
        inputSchema: {
          type: 'object',
        },
      }],
    },
  });
  successToolCallName = toolCallResponse.toolCalls[0]?.name ?? '';

  mswIntercept({ fixtureKey: 'openrouter/chat-completions/500' });
  try {
    await generateWithOpenRouter({
      request,
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    });
  } catch (error) {
    failureCode = (error as HarnessProviderError).code;
  }

  try {
    await generateWithOpenRouter({
      request: {
        ...request,
        modelId: 'openai/gpt-4.1',
      },
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }

  mswIntercept({ fixtureKey: 'openrouter/chat-completions/200-tool-call-invalid-arguments' });
  try {
    await adapter.generate({
      request: {
        ...request,
        tools: [{
          name: 'send_email',
          description: 'Send outbound mail.',
          inputSchema: {
            type: 'object',
          },
        }],
      },
    });
  } catch (error) {
    invalidToolArgumentsCode = (error as HarnessProviderError).code;
  }

  emptyAssistantContent = buildOpenRouterChatMessage({
    message: {
      role: 'assistant',
      parts: [],
    },
  }).content;
});

describe('openrouter provider adapter', () => {
  it('returns normalized assistant text on successful responses', () => {
    expect(successText).toBe('Fixture response');
  });

  it('maps 5xx provider responses to provider_internal', () => {
    expect(failureCode).toBe('provider_internal');
  });

  it('parses function tool calls into normalized tool-call payloads', () => {
    expect(successToolCallName).toBe('send_email');
  });

  it('fails with response_parse_failed when tool-call arguments are invalid json', () => {
    expect(invalidToolArgumentsCode).toBe('response_parse_failed');
  });

  it('rejects non-openrouter provider model ids', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });

  it('serializes empty non-tool message content as empty string', () => {
    expect(emptyAssistantContent).toBe('');
  });
});
