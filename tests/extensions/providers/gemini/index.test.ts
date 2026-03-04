import type { HarnessProviderGenerateRequest } from '@engine/harness/providers/contract';

import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/providers/contract';
import {
  buildGeminiContents,
  buildGeminiTools,
  createGeminiProviderAdapter,
  decodeGeminiToolCallId,
  encodeGeminiToolCallId,
  generateWithGemini,
} from '@extensions/providers/gemini';
import { mswIntercept } from '@tests/network/index';

const request: HarnessProviderGenerateRequest = {
  modelId: 'gemini/gemini-2.5-pro',
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
let serializedFunctionResponsePartCount = 0;
let topLevelAdditionalPropertiesRemoved = false;
let nestedAdditionalPropertiesRemoved = false;
let decodedToolCallHasProviderId = false;
let decodedToolCallHasThoughtSignature = false;
let functionResponseIncludesProviderCallId = false;

beforeAll(async (): Promise<void> => {
  mswIntercept({ fixtureKey: 'gemini/generate-content/200' });
  const adapter = createGeminiProviderAdapter({
    config: {
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    },
  });
  const success = await adapter.generate({ request });
  successText = success.text ?? '';

  mswIntercept({ fixtureKey: 'gemini/generate-content/200-tool-call' });
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

  mswIntercept({ fixtureKey: 'gemini/generate-content/500' });
  try {
    await generateWithGemini({
      request,
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      },
    });
  } catch (error) {
    failureCode = (error as HarnessProviderError).code;
  }

  try {
    await generateWithGemini({
      request: {
        ...request,
        modelId: 'openai/gpt-4.1',
      },
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      },
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }
  const encodedReadFileToolCallId = encodeGeminiToolCallId({
    name: 'read_file',
    sequence: 1,
  });
  serializedFunctionResponsePartCount = buildGeminiContents({
    messages: [
      {
        role: 'assistant',
        parts: [],
        toolCalls: [{
          id: encodedReadFileToolCallId,
          name: 'read_file',
          input: {
            path: '/tmp/demo.txt',
          },
        }],
      },
      {
        role: 'tool',
        toolCallId: encodedReadFileToolCallId,
        parts: [{
          type: 'text',
          text: '{"ok":true}',
        }],
      },
    ],
  })[1]?.parts.length ?? 0;
  const sanitizedTools = buildGeminiTools({
    request: {
      ...request,
      tools: [{
        name: 'write_file',
        description: 'Write one file.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
            },
            metadata: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: {
                  type: 'string',
                },
              },
            },
          },
          required: ['path'],
        },
      }],
    },
  });
  const sanitizedParameters = sanitizedTools?.[0]?.functionDeclarations?.[0]?.parameters as Record<string, unknown> | undefined;
  topLevelAdditionalPropertiesRemoved = !('additionalProperties' in (sanitizedParameters ?? {}));
  const sanitizedMetadataSchema = (
    sanitizedParameters?.properties as Record<string, unknown> | undefined
  )?.metadata as Record<string, unknown> | undefined;
  nestedAdditionalPropertiesRemoved = !('additionalProperties' in (sanitizedMetadataSchema ?? {}));
  const encodedToolCallId = encodeGeminiToolCallId({
    name: 'send_email',
    sequence: 1,
    providerCallId: 'fc_123',
    thoughtSignature: 'ts_abc',
  });
  const decodedToolCallId = decodeGeminiToolCallId({
    toolCallId: encodedToolCallId,
  });
  decodedToolCallHasProviderId = decodedToolCallId.providerCallId === 'fc_123';
  decodedToolCallHasThoughtSignature = decodedToolCallId.thoughtSignature === 'ts_abc';
  const functionResponsePayload = buildGeminiContents({
    messages: [{
      role: 'tool',
      toolCallId: encodedToolCallId,
      parts: [{
        type: 'text',
        text: '{"ok":true}',
      }],
    }],
  })[0]?.parts[0] as Record<string, unknown> | undefined;
  const functionResponseRecord = functionResponsePayload?.functionResponse as Record<string, unknown> | undefined;
  functionResponseIncludesProviderCallId = functionResponseRecord?.id === 'fc_123';
});

describe('gemini provider adapter', () => {
  it('returns normalized assistant text on successful responses', () => {
    expect(successText).toBe('Fixture response');
  });

  it('maps 5xx provider responses to provider_internal', () => {
    expect(failureCode).toBe('provider_internal');
  });

  it('parses function-call parts into normalized tool-call payloads', () => {
    expect(successToolCallName).toBe('send_email');
  });

  it('rejects non-gemini provider model ids', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });

  it('serializes tool result messages into one functionResponse part when tool name is known', () => {
    expect(serializedFunctionResponsePartCount).toBe(1);
  });

  it('removes unsupported top-level additionalProperties from gemini tool schemas', () => {
    expect(topLevelAdditionalPropertiesRemoved).toBe(true);
  });

  it('removes unsupported nested additionalProperties from gemini tool schemas', () => {
    expect(nestedAdditionalPropertiesRemoved).toBe(true);
  });

  it('roundtrips gemini provider call ids through encoded tool-call ids', () => {
    expect(decodedToolCallHasProviderId).toBe(true);
  });

  it('roundtrips gemini thought signatures through encoded tool-call ids', () => {
    expect(decodedToolCallHasThoughtSignature).toBe(true);
  });

  it('includes functionResponse.id when encoded tool-call metadata has provider id', () => {
    expect(functionResponseIncludesProviderCallId).toBe(true);
  });
});
