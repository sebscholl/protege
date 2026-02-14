import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/provider-contract';
import { createOpenAiProviderAdapter } from '@engine/harness/providers/openai';
import { executeProviderToolLoop } from '@engine/harness/runtime';
import { loadToolRegistry } from '@engine/harness/tool-registry';
import { mswIntercept } from '@tests/network/index';

let maxTurnsErrorCode = '';
let unknownToolErrorMessage = '';

beforeAll(async (): Promise<void> => {
  const adapter = createOpenAiProviderAdapter({
    config: {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    },
  });
  const registry = await loadToolRegistry();

  mswIntercept({ fixtureKey: 'openai/chat-completions/200-tool-call' });
  try {
    await executeProviderToolLoop({
      adapter,
      modelId: 'openai/gpt-4.1',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Test loop.' }] }],
      tools: [{
        name: 'send_email',
        description: 'Send email.',
        inputSchema: { type: 'object' },
      }],
      maxTurns: 1,
      registry,
      toolContext: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'fixture-id' }),
        },
      },
    });
  } catch (error) {
    maxTurnsErrorCode = (error as HarnessProviderError).code;
  }

  mswIntercept({ fixtureKey: 'openai/chat-completions/200-tool-call-unknown' });
  try {
    await executeProviderToolLoop({
      adapter,
      modelId: 'openai/gpt-4.1',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Unknown tool.' }] }],
      tools: [{
        name: 'send_email',
        description: 'Send email.',
        inputSchema: { type: 'object' },
      }],
      maxTurns: 2,
      registry,
      toolContext: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'fixture-id' }),
        },
      },
    });
  } catch (error) {
    unknownToolErrorMessage = (error as Error).message;
  }
});

describe('harness provider tool loop hardening', () => {
  it('fails with response_parse_failed when tool loop exceeds max turns', () => {
    expect(maxTurnsErrorCode).toBe('response_parse_failed');
  });

  it('fails when provider requests an unknown tool name', () => {
    expect(unknownToolErrorMessage.includes('Tool not found')).toBe(true);
  });
});
