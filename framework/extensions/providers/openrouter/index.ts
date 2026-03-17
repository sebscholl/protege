import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
  HarnessProviderMessage,
} from 'protege-toolkit';

import {
  HarnessProviderError,
  parseProviderModelId,
} from 'protege-toolkit';

/**
 * Represents one OpenRouter adapter runtime dependency configuration.
 */
export type OpenRouterAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Represents one serialized OpenRouter chat-completions message payload.
 */
export type OpenRouterChatMessagePayload = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

/**
 * Creates one OpenRouter provider adapter using normalized harness contracts.
 */
export function createOpenRouterProviderAdapter(
  args: {
    config: OpenRouterAdapterConfig;
  },
): HarnessProviderAdapter {
  return {
    providerId: 'openrouter',
    capabilities: {
      tools: true,
      structuredOutput: false,
      streaming: false,
    },
    generate: async (
      adapterArgs: {
        request: HarnessProviderGenerateRequest;
      },
    ): Promise<HarnessProviderGenerateResponse> => {
      return generateWithOpenRouter({
        request: adapterArgs.request,
        config: args.config,
      });
    },
  };
}

/**
 * Executes one OpenRouter chat-completions request using normalized harness payload.
 */
export async function generateWithOpenRouter(
  args: {
    request: HarnessProviderGenerateRequest;
    config: OpenRouterAdapterConfig;
  },
): Promise<HarnessProviderGenerateResponse> {
  const parsedModel = parseProviderModelId({
    modelId: args.request.modelId,
  });
  if (parsedModel.providerId !== 'openrouter') {
    throw new HarnessProviderError({
      code: 'unsupported_provider',
      message: `OpenRouter adapter cannot handle provider: ${parsedModel.providerId}.`,
    });
  }

  const baseUrl = args.config.baseUrl ?? 'https://openrouter.ai/api/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: parsedModel.modelName,
      messages: args.request.messages.map((message) => buildOpenRouterChatMessage({
        message,
      })),
      tools: args.request.tools?.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      temperature: args.request.temperature,
      max_tokens: args.request.maxOutputTokens,
    }),
  });

  if (!response.ok) {
    throw mapOpenRouterHttpError({
      status: response.status,
      bodyText: await response.text(),
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = await response.json() as Record<string, unknown>;
  } catch (error) {
    throw new HarnessProviderError({
      code: 'response_parse_failed',
      message: 'Failed to parse OpenRouter JSON response.',
      cause: error,
    });
  }

  return {
    text: extractOpenRouterText({ response: parsed }),
    toolCalls: extractOpenRouterToolCalls({ response: parsed }),
    finishReason: extractOpenRouterFinishReason({ response: parsed }),
    usage: extractOpenRouterUsage({ response: parsed }),
    rawProviderResponse: parsed,
  };
}

/**
 * Serializes one normalized harness message into an OpenRouter chat-completions message payload.
 */
export function buildOpenRouterChatMessage(
  args: {
    message: HarnessProviderMessage;
  },
): OpenRouterChatMessagePayload {
  const content = args.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
  if (args.message.role === 'tool') {
    if (!args.message.toolCallId) {
      throw new HarnessProviderError({
        code: 'bad_request',
        message: 'Tool result message is missing toolCallId.',
      });
    }

    return {
      role: 'tool',
      content,
      tool_call_id: args.message.toolCallId,
    };
  }

  return {
    role: args.message.role,
    content,
    tool_calls: args.message.toolCalls?.map((toolCall) => ({
      id: toolCall.id,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.input),
      },
    })),
  };
}

/**
 * Extracts normalized tool-call payloads from one OpenRouter chat-completions response.
 */
export function extractOpenRouterToolCalls(
  args: {
    response: Record<string, unknown>;
  },
): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  const choices = args.response.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const toolCallsRaw = message?.tool_calls;
  if (!Array.isArray(toolCallsRaw)) {
    return [];
  }

  const output: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  for (const entry of toolCallsRaw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const functionRecord = record.function as Record<string, unknown> | undefined;
    const name = typeof functionRecord?.name === 'string' ? functionRecord.name : '';
    const argumentsText = typeof functionRecord?.arguments === 'string' ? functionRecord.arguments : '{}';
    if (id.length === 0 || name.length === 0) {
      continue;
    }

    let parsedArguments: Record<string, unknown>;
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      parsedArguments = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch (error) {
      throw new HarnessProviderError({
        code: 'response_parse_failed',
        message: `Failed to parse tool-call arguments for tool: ${name}.`,
        cause: error,
      });
    }

    output.push({
      id,
      name,
      input: parsedArguments,
    });
  }

  return output;
}

/**
 * Maps OpenRouter HTTP status codes into normalized harness provider errors.
 */
export function mapOpenRouterHttpError(
  args: {
    status: number;
    bodyText: string;
  },
): HarnessProviderError {
  if (args.status === 400) {
    return new HarnessProviderError({
      code: 'bad_request',
      message: args.bodyText || 'OpenRouter rejected request payload.',
    });
  }

  if (args.status === 401 || args.status === 403) {
    return new HarnessProviderError({
      code: 'unauthorized',
      message: args.bodyText || 'OpenRouter authentication failed.',
    });
  }

  if (args.status === 429) {
    return new HarnessProviderError({
      code: 'rate_limited',
      message: args.bodyText || 'OpenRouter rate limit exceeded.',
    });
  }

  if (args.status >= 500) {
    return new HarnessProviderError({
      code: 'provider_internal',
      message: args.bodyText || 'OpenRouter provider internal error.',
    });
  }

  return new HarnessProviderError({
    code: 'unavailable',
    message: args.bodyText || `OpenRouter request failed with status ${args.status}.`,
  });
}

/**
 * Extracts assistant text content from one OpenRouter chat-completions response.
 */
export function extractOpenRouterText(
  args: {
    response: Record<string, unknown>;
  },
): string {
  const choices = args.response.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Extracts normalized usage information from one OpenRouter response payload.
 */
export function extractOpenRouterUsage(
  args: {
    response: Record<string, unknown>;
  },
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined {
  const usage = args.response.usage as Record<string, unknown> | undefined;
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
  };
}

/**
 * Extracts one finish reason string from an OpenRouter response when present.
 */
export function extractOpenRouterFinishReason(
  args: {
    response: Record<string, unknown>;
  },
): string | undefined {
  const choices = args.response.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  return typeof firstChoice?.finish_reason === 'string'
    ? firstChoice.finish_reason
    : undefined;
}
