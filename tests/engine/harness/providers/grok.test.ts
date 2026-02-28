import type { HarnessProviderGenerateRequest } from '@engine/harness/provider-contract';

import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/provider-contract';
import {
  buildGrokChatMessage,
  createGrokProviderAdapter,
  generateWithGrok,
} from '@engine/harness/providers/grok';
import { mswIntercept } from '@tests/network/index';

const request: HarnessProviderGenerateRequest = {
  modelId: 'grok/grok-3-latest',
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
  mswIntercept({ fixtureKey: 'grok/chat-completions/200' });
  const adapter = createGrokProviderAdapter({
    config: {
      apiKey: 'test-key',
      baseUrl: 'https://api.x.ai/v1',
    },
  });
  const success = await adapter.generate({ request });
  successText = success.text ?? '';

  mswIntercept({ fixtureKey: 'grok/chat-completions/200-tool-call' });
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

  mswIntercept({ fixtureKey: 'grok/chat-completions/500' });
  try {
    await generateWithGrok({
      request,
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://api.x.ai/v1',
      },
    });
  } catch (error) {
    failureCode = (error as HarnessProviderError).code;
  }

  try {
    await generateWithGrok({
      request: {
        ...request,
        modelId: 'openai/gpt-4.1',
      },
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://api.x.ai/v1',
      },
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }

  mswIntercept({
    fixtureKey: 'grok/chat-completions/200-tool-call',
    merge: {
      response: {
        body: {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'call_send_email_1',
                type: 'function',
                function: {
                  name: 'send_email',
                  arguments: '{bad json}',
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        },
      },
    },
  });
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

  emptyAssistantContent = buildGrokChatMessage({
    message: {
      role: 'assistant',
      parts: [],
    },
  }).content;
});

describe('grok provider adapter', () => {
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

  it('rejects non-grok provider model ids', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });

  it('serializes empty non-tool message content as empty string', () => {
    expect(emptyAssistantContent).toBe('');
  });
});
