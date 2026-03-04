import type { HarnessProviderGenerateRequest } from '@engine/harness/providers/contract';

import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/providers/contract';
import {
  buildAnthropicMessage,
  createAnthropicProviderAdapter,
  generateWithAnthropic,
  parseAnthropicToolInput,
  sanitizeAnthropicMessages,
} from '@extensions/providers/anthropic';
import { mswIntercept } from '@tests/network/index';

const request: HarnessProviderGenerateRequest = {
  modelId: 'anthropic/claude-3-7-sonnet-latest',
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
let toolResultMessageRole = '';
let sanitizedMessageCount = -1;
let parsedStringToolInputHasTextField = false;

beforeAll(async (): Promise<void> => {
  mswIntercept({ fixtureKey: 'anthropic/messages/200' });
  const adapter = createAnthropicProviderAdapter({
    config: {
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com/v1',
      version: '2023-06-01',
    },
  });
  const success = await adapter.generate({ request });
  successText = success.text ?? '';

  mswIntercept({ fixtureKey: 'anthropic/messages/200-tool-call' });
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

  mswIntercept({ fixtureKey: 'anthropic/messages/500' });
  try {
    await generateWithAnthropic({
      request,
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.com/v1',
      },
    });
  } catch (error) {
    failureCode = (error as HarnessProviderError).code;
  }

  try {
    await generateWithAnthropic({
      request: {
        ...request,
        modelId: 'openai/gpt-4.1',
      },
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.com/v1',
      },
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }

  toolResultMessageRole = buildAnthropicMessage({
    message: {
      role: 'tool',
      toolCallId: 'toolu_test_1',
      parts: [{ type: 'text', text: 'ok' }],
    },
  })?.role ?? '';
  sanitizedMessageCount = sanitizeAnthropicMessages({
    messages: [
      buildAnthropicMessage({
        message: {
          role: 'user',
          parts: [{ type: 'text', text: '' }],
        },
      }),
      buildAnthropicMessage({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'ok' }],
        },
      }),
    ],
  }).length;
  parsedStringToolInputHasTextField = typeof parseAnthropicToolInput({
    value: '{"text":"hello"}',
  }).text === 'string';
});

describe('anthropic provider adapter', () => {
  it('returns normalized assistant text on successful responses', () => {
    expect(successText).toBe('Fixture response');
  });

  it('maps 5xx provider responses to provider_internal', () => {
    expect(failureCode).toBe('provider_internal');
  });

  it('parses tool_use blocks into normalized tool-call payloads', () => {
    expect(successToolCallName).toBe('send_email');
  });

  it('rejects non-anthropic provider model ids', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });

  it('serializes tool results as user-role messages for anthropic', () => {
    expect(toolResultMessageRole).toBe('user');
  });

  it('drops empty text-only messages before anthropic request submission', () => {
    expect(sanitizedMessageCount).toBe(1);
  });

  it('parses stringified anthropic tool input payloads into objects', () => {
    expect(parsedStringToolInputHasTextField).toBe(true);
  });
});
