import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/provider-contract';
import type { HarnessProviderAdapter } from '@engine/harness/provider-contract';
import type { HarnessProviderGenerateRequest } from '@engine/harness/provider-contract';
import { createOpenAiProviderAdapter } from '@engine/harness/providers/openai';
import { executeProviderToolLoop } from '@engine/harness/runtime';
import { loadToolRegistry } from '@engine/harness/tool-registry';
import { mswIntercept } from '@tests/network/index';

let maxTurnsErrorCode = '';
let unknownToolErrorMessage = '';
let startedEvents = 0;
let completedEvents = 0;
let failedEvents = 0;
let receivedEvents = 0;
let multiToolStartedEvents = 0;
let multiToolCompletedEvents = 0;
let multiToolInvokedActions: string[] = [];
let multiToolResponseText = '';
let failingMultiToolInvokedActions: string[] = [];
let failingMultiToolFailedEvents = 0;
let failingMultiToolCompletedEvents = 0;
let failingMultiToolErrorMessage = '';

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
        logger: {
          info: (
            args: {
              event: string;
              context: Record<string, unknown>;
            },
          ): void => {
            if (args.event === 'harness.tool.call.started') {
              startedEvents += 1;
            }
            if (args.event === 'harness.tool.call.completed') {
              completedEvents += 1;
            }
            if (args.event === 'harness.tool.calls.received') {
              receivedEvents += 1;
            }
          },
          error: (): void => undefined,
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
        logger: {
          info: (
            args: {
              event: string;
              context: Record<string, unknown>;
            },
          ): void => {
            if (args.event === 'harness.tool.call.started') {
              startedEvents += 1;
            }
            if (args.event === 'harness.tool.call.completed') {
              completedEvents += 1;
            }
            if (args.event === 'harness.tool.calls.received') {
              receivedEvents += 1;
            }
          },
          error: (
            args: {
              event: string;
              context: Record<string, unknown>;
            },
          ): void => {
            if (args.event === 'harness.tool.call.failed') {
              failedEvents += 1;
            }
          },
        },
      },
    });
  } catch (error) {
    unknownToolErrorMessage = (error as Error).message;
  }

  const multiToolAdapter: HarnessProviderAdapter = {
    providerId: 'openai',
    capabilities: {
      tools: true,
      structuredOutput: false,
      streaming: false,
    },
    generate: async (
      args: {
        request: HarnessProviderGenerateRequest;
      },
    ) => {
      const toolResultMessages = args.request.messages.filter(
        (message) => message.role === 'tool',
      );
      if (toolResultMessages.length === 0) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_send_email_1',
              name: 'send_email',
              input: {
                to: ['receiver-a@example.com'],
                subject: 'A',
                text: 'A body',
              },
            },
            {
              id: 'call_send_email_2',
              name: 'send_email',
              input: {
                to: ['receiver-b@example.com'],
                subject: 'B',
                text: 'B body',
              },
            },
          ],
        };
      }

      return {
        text: 'Final after two tool calls.',
        toolCalls: [],
      };
    },
  };

  const multiToolResult = await executeProviderToolLoop({
    adapter: multiToolAdapter,
    modelId: 'openai/gpt-4.1',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'Run two tool calls.' }] }],
    tools: [{
      name: 'send_email',
      description: 'Send email.',
      inputSchema: { type: 'object' },
    }],
    registry,
    toolContext: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          multiToolInvokedActions.push(args.action);
          return {
            messageId: `fixture-${args.payload.subject as string}`,
          };
        },
      },
      logger: {
        info: (
          args: {
            event: string;
            context: Record<string, unknown>;
          },
        ): void => {
          if (args.event === 'harness.tool.call.started') {
            multiToolStartedEvents += 1;
          }
          if (args.event === 'harness.tool.call.completed') {
            multiToolCompletedEvents += 1;
          }
        },
        error: (): void => undefined,
      },
    },
  });
  multiToolResponseText = multiToolResult.responseText;

  const failingMultiToolAdapter: HarnessProviderAdapter = {
    providerId: 'openai',
    capabilities: {
      tools: true,
      structuredOutput: false,
      streaming: false,
    },
    generate: async (): Promise<{
      text?: string;
      toolCalls: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
    }> => {
      return {
        text: '',
        toolCalls: [
          {
            id: 'call_send_email_fail_1',
            name: 'send_email',
            input: {
              to: ['receiver-a@example.com'],
              subject: 'A',
              text: 'A body',
            },
          },
          {
            id: 'call_send_email_fail_2',
            name: 'send_email',
            input: {
              to: ['receiver-b@example.com'],
              subject: 'B',
              text: 'B body',
            },
          },
        ],
      };
    },
  };

  try {
    await executeProviderToolLoop({
      adapter: failingMultiToolAdapter,
      modelId: 'openai/gpt-4.1',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Run two tool calls with fail.' }] }],
      tools: [{
        name: 'send_email',
        description: 'Send email.',
        inputSchema: { type: 'object' },
      }],
      registry,
      maxTurns: 1,
      toolContext: {
        runtime: {
          invoke: async (
            args: {
              action: string;
              payload: Record<string, unknown>;
            },
          ): Promise<Record<string, unknown>> => {
            failingMultiToolInvokedActions.push(args.action);
            throw new Error(`smtp unavailable for ${args.payload.subject as string}`);
          },
        },
        logger: {
          info: (
            args: {
              event: string;
              context: Record<string, unknown>;
            },
          ): void => {
            if (args.event === 'harness.tool.call.completed') {
              failingMultiToolCompletedEvents += 1;
            }
          },
          error: (
            args: {
              event: string;
              context: Record<string, unknown>;
            },
          ): void => {
            if (args.event === 'harness.tool.call.failed') {
              failingMultiToolFailedEvents += 1;
            }
          },
        },
      },
    });
  } catch (error) {
    failingMultiToolErrorMessage = (error as Error).message;
  }
});

describe('harness provider tool loop hardening', () => {
  it('fails with response_parse_failed when tool loop exceeds max turns', () => {
    expect(maxTurnsErrorCode).toBe('response_parse_failed');
  });

  it('fails when provider requests an unknown tool name', () => {
    expect(unknownToolErrorMessage.includes('Tool not found')).toBe(true);
  });

  it('emits started and completed events for successful tool execution', () => {
    expect(startedEvents > 0 && completedEvents > 0).toBe(true);
  });

  it('emits failed events for tool execution errors', () => {
    expect(failedEvents).toBe(1);
  });

  it('emits one received event per provider response containing tool calls', () => {
    expect(receivedEvents).toBe(2);
  });

  it('executes all tool calls when provider returns multiple calls in one turn', () => {
    expect(multiToolInvokedActions.length).toBe(2);
  });

  it('emits started/completed events for each tool call in a multi-call turn', () => {
    expect(multiToolStartedEvents === 2 && multiToolCompletedEvents === 2).toBe(true);
  });

  it('continues provider loop after multi-call execution and returns final text', () => {
    expect(multiToolResponseText).toBe('Final after two tool calls.');
  });

  it('stops multi-call execution after first tool failure to avoid partial downstream side effects', () => {
    expect(failingMultiToolInvokedActions.length).toBe(1);
  });

  it('emits failed tool-call events and no completed events when the first call errors', () => {
    expect(failingMultiToolFailedEvents === 1 && failingMultiToolCompletedEvents === 0).toBe(true);
  });

  it('propagates first tool failure error message to the caller', () => {
    expect(failingMultiToolErrorMessage.includes('smtp unavailable')).toBe(true);
  });
});
