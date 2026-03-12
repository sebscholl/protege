import { beforeAll, describe, expect, it } from 'vitest';

import { HarnessProviderError } from '@engine/harness/providers/contract';
import type { HarnessProviderAdapter } from '@engine/harness/providers/contract';
import type { HarnessProviderGenerateRequest } from '@engine/harness/providers/contract';
import { createOpenAiProviderAdapter } from '@extensions/providers/openai';
import { executeProviderToolLoop } from '@engine/harness/runtime';
import { loadToolRegistry } from '@engine/harness/tools/registry';
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
let recoveryResponseText = '';
let recoveryFirstToolErrorHasStackPreview = false;
let recoveryFirstToolErrorCode = '';
let recoveryFirstToolErrorMessage = '';
let recoveryFirstToolInputPath = '';
let recoveryToolInvokedActions: string[] = [];
let sendEmailFailureRequiredFields: string[] = [];
let sendEmailRecoveryInvokedActions: string[] = [];
let unknownToolFailureHasInputContext = false;
let unknownToolFailureHasStackPreview = false;
let receivedEventIncludesToolInputs = false;

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
              receivedEventIncludesToolInputs = Array.isArray(args.context.toolCalls)
                && (args.context.toolCalls as Array<Record<string, unknown>>).length > 0
                && typeof (args.context.toolCalls as Array<Record<string, unknown>>)[0]?.input === 'object';
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
              unknownToolFailureHasInputContext = typeof args.context.toolInput === 'object'
                && args.context.toolInput !== null;
              unknownToolFailureHasStackPreview = Array.isArray(args.context.errorStackPreview);
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

  const recoveryAdapter: HarnessProviderAdapter = {
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
      const toolMessages = args.request.messages.filter((message) => message.role === 'tool');
      if (toolMessages.length === 0) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_read_missing_file',
              name: 'read_file',
              input: {
                path: '/tmp/does-not-exist.txt',
              },
            },
          ],
        };
      }

      const firstToolText = toolMessages[0]?.parts?.[0]?.text;
      const parsed = typeof firstToolText === 'string'
        ? JSON.parse(firstToolText) as Record<string, unknown>
        : {};
      const stackPreview = (
        typeof parsed.error === 'object'
        && parsed.error !== null
        && Array.isArray((parsed.error as Record<string, unknown>).stackPreview)
      )
        ? (parsed.error as Record<string, unknown>).stackPreview as unknown[]
        : [];
      recoveryFirstToolErrorHasStackPreview = stackPreview.length > 0;
      recoveryFirstToolErrorCode = (
        typeof parsed.error === 'object'
        && parsed.error !== null
        && typeof (parsed.error as Record<string, unknown>).code === 'string'
      )
        ? (parsed.error as Record<string, unknown>).code as string
        : '';
      recoveryFirstToolErrorMessage = (
        typeof parsed.error === 'object'
        && parsed.error !== null
        && typeof (parsed.error as Record<string, unknown>).message === 'string'
      )
        ? (parsed.error as Record<string, unknown>).message as string
        : '';
      recoveryFirstToolInputPath = (
        typeof parsed.input === 'object'
        && parsed.input !== null
        && typeof (parsed.input as Record<string, unknown>).path === 'string'
      )
        ? (parsed.input as Record<string, unknown>).path as string
        : '';

      if (toolMessages.length > 1) {
        return {
          text: 'Recovered successfully after tool failure.',
          toolCalls: [],
        };
      }

      return {
        text: '',
        toolCalls: [
          {
            id: 'call_send_recovery_email',
            name: 'send_email',
            input: {
              to: ['receiver@example.com'],
              subject: 'Recovered after tool error',
              text: 'I recovered by taking a different action.',
            },
          },
        ],
      };
    },
  };

  recoveryResponseText = (await executeProviderToolLoop({
    adapter: recoveryAdapter,
    modelId: 'openai/gpt-4.1',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'Recover after tool failure.' }] }],
    tools: [{
      name: 'read_file',
      description: 'Read one file.',
      inputSchema: { type: 'object' },
    }, {
      name: 'send_email',
      description: 'Send email.',
      inputSchema: { type: 'object' },
    }],
    registry,
    maxTurns: 3,
    toolContext: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          recoveryToolInvokedActions.push(args.action);
          if (args.action === 'file.read') {
            throw new Error('ENOENT: no such file or directory');
          }
          return {
            messageId: 'recovered-message-id',
          };
        },
      },
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
    },
  })).responseText;

  const sendEmailRecoveryAdapter: HarnessProviderAdapter = {
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
      const toolMessages = args.request.messages.filter((message) => message.role === 'tool');
      if (toolMessages.length === 0) {
        return {
          text: '',
          toolCalls: [{
            id: 'call_send_email_missing_text',
            name: 'send_email',
            input: {
              to: ['receiver@example.com'],
              subject: 'Missing body',
            },
          }],
        };
      }

      if (toolMessages.length > 1) {
        return {
          text: 'Recovered after send_email validation failure.',
          toolCalls: [],
        };
      }

      const firstToolPayload = JSON.parse(toolMessages[0]?.parts[0]?.text ?? '{}') as Record<string, unknown>;
      sendEmailFailureRequiredFields = (
        typeof firstToolPayload.toolContract === 'object'
        && firstToolPayload.toolContract !== null
        && Array.isArray((firstToolPayload.toolContract as Record<string, unknown>).requiredFields)
      )
        ? (firstToolPayload.toolContract as Record<string, unknown>).requiredFields as string[]
        : [];

      return {
        text: '',
        toolCalls: [{
          id: 'call_send_email_fixed',
          name: 'send_email',
          input: {
            to: ['receiver@example.com'],
            subject: 'Recovered body',
            text: 'Recovered after reading required fields.',
          },
        }],
      };
    },
  };

  await executeProviderToolLoop({
    adapter: sendEmailRecoveryAdapter,
    modelId: 'openai/gpt-4.1',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'Recover missing send_email text.' }] }],
    tools: [{
      name: 'send_email',
      description: 'Send email.',
      inputSchema: { type: 'object' },
    }],
    registry,
    maxTurns: 3,
    toolContext: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          sendEmailRecoveryInvokedActions.push(args.action);
          return {
            messageId: `fixture-${args.payload.subject as string}`,
          };
        },
      },
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
    },
  });
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

  it('includes failed tool input payload in failure log context', () => {
    expect(unknownToolFailureHasInputContext).toBe(true);
  });

  it('includes failed tool stack preview in failure log context', () => {
    expect(unknownToolFailureHasStackPreview).toBe(true);
  });

  it('emits one received event per provider response containing tool calls', () => {
    expect(receivedEvents).toBe(2);
  });

  it('includes tool call input payloads in received event context', () => {
    expect(receivedEventIncludesToolInputs).toBe(true);
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
    expect(failingMultiToolErrorMessage.includes('maximum tool loop turns')).toBe(true);
  });

  it('includes stack preview details in structured tool failure feedback', () => {
    expect(recoveryFirstToolErrorHasStackPreview).toBe(true);
  });

  it('includes structured tool failure error code in feedback', () => {
    expect(recoveryFirstToolErrorCode).toBe('tool_execution_failed');
  });

  it('includes original tool error message in feedback', () => {
    expect(recoveryFirstToolErrorMessage.includes('ENOENT')).toBe(true);
  });

  it('includes original tool input payload in feedback', () => {
    expect(recoveryFirstToolInputPath).toBe('/tmp/does-not-exist.txt');
  });

  it('allows the model to recover after one failed tool call and continue execution', () => {
    expect(recoveryToolInvokedActions.join(',')).toBe('file.read,email.send');
  });

  it('returns final assistant text after recovery tool execution', () => {
    expect(recoveryResponseText).toBe('Recovered successfully after tool failure.');
  });

  it('includes required schema fields in tool failure feedback', () => {
    expect(sendEmailFailureRequiredFields.includes('text')).toBe(true);
  });

  it('allows recovery after send_email validation failure', () => {
    expect(sendEmailRecoveryInvokedActions.join(',')).toBe('email.send');
  });
});
