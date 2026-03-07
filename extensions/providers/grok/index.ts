import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
  HarnessProviderMessage,
} from 'protege/toolkit';

import {
  HarnessProviderError,
  parseProviderModelId,
} from 'protege/toolkit';

/**
 * Represents one Grok adapter runtime dependency configuration.
 */
export type GrokAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Represents one serialized Grok chat-completions message payload.
 */
export type GrokChatMessagePayload = {
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
 * Creates one Grok provider adapter using normalized harness contracts.
 */
export function createGrokProviderAdapter(
  args: {
    config: GrokAdapterConfig;
  },
): HarnessProviderAdapter {
  return {
    providerId: 'grok',
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
      return generateWithGrok({
        request: adapterArgs.request,
        config: args.config,
      });
    },
  };
}

/**
 * Executes one Grok chat-completions request using normalized harness payload.
 */
export async function generateWithGrok(
  args: {
    request: HarnessProviderGenerateRequest;
    config: GrokAdapterConfig;
  },
): Promise<HarnessProviderGenerateResponse> {
  const parsedModel = parseProviderModelId({
    modelId: args.request.modelId,
  });
  if (parsedModel.providerId !== 'grok') {
    throw new HarnessProviderError({
      code: 'unsupported_provider',
      message: `Grok adapter cannot handle provider: ${parsedModel.providerId}.`,
    });
  }

  const baseUrl = args.config.baseUrl ?? 'https://api.x.ai/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: parsedModel.modelName,
      messages: args.request.messages.map((message) => buildGrokChatMessage({
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
    throw mapGrokHttpError({
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
      message: 'Failed to parse Grok JSON response.',
      cause: error,
    });
  }

  return {
    text: extractGrokText({ response: parsed }),
    toolCalls: extractGrokToolCalls({ response: parsed }),
    finishReason: extractGrokFinishReason({ response: parsed }),
    usage: extractGrokUsage({ response: parsed }),
    rawProviderResponse: parsed,
  };
}

/**
 * Serializes one normalized harness message into a Grok chat-completions message payload.
 */
export function buildGrokChatMessage(
  args: {
    message: HarnessProviderMessage;
  },
): GrokChatMessagePayload {
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
 * Extracts normalized tool-call payloads from one Grok chat-completions response.
 */
export function extractGrokToolCalls(
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
 * Maps Grok HTTP status codes into normalized harness provider errors.
 */
export function mapGrokHttpError(
  args: {
    status: number;
    bodyText: string;
  },
): HarnessProviderError {
  if (args.status === 400) {
    return new HarnessProviderError({
      code: 'bad_request',
      message: args.bodyText || 'Grok rejected request payload.',
    });
  }

  if (args.status === 401 || args.status === 403) {
    return new HarnessProviderError({
      code: 'unauthorized',
      message: args.bodyText || 'Grok authentication failed.',
    });
  }

  if (args.status === 429) {
    return new HarnessProviderError({
      code: 'rate_limited',
      message: args.bodyText || 'Grok rate limit exceeded.',
    });
  }

  if (args.status >= 500) {
    return new HarnessProviderError({
      code: 'provider_internal',
      message: args.bodyText || 'Grok provider internal error.',
    });
  }

  return new HarnessProviderError({
    code: 'unavailable',
    message: args.bodyText || `Grok request failed with status ${args.status}.`,
  });
}

/**
 * Extracts assistant text content from one Grok chat-completions response.
 */
export function extractGrokText(
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
 * Extracts normalized usage information from one Grok response payload.
 */
export function extractGrokUsage(
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
 * Extracts one finish reason string from a Grok response when present.
 */
export function extractGrokFinishReason(
  args: {
    response: Record<string, unknown>;
  },
): string | undefined {
  const choices = args.response.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  const finishReason = firstChoice?.finish_reason;
  return typeof finishReason === 'string' ? finishReason : undefined;
}
