import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
} from '@engine/harness/provider-contract';

import {
  HarnessProviderError,
  parseProviderModelId,
} from '@engine/harness/provider-contract';

/**
 * Represents one OpenAI adapter runtime dependency configuration.
 */
export type OpenAiAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Creates one OpenAI provider adapter using normalized harness contracts.
 */
export function createOpenAiProviderAdapter(
  args: {
    config: OpenAiAdapterConfig;
  },
): HarnessProviderAdapter {
  return {
    providerId: 'openai',
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
      return generateWithOpenAi({
        request: adapterArgs.request,
        config: args.config,
      });
    },
  };
}

/**
 * Executes one OpenAI chat-completions request using normalized harness payload.
 */
export async function generateWithOpenAi(
  args: {
    request: HarnessProviderGenerateRequest;
    config: OpenAiAdapterConfig;
  },
): Promise<HarnessProviderGenerateResponse> {
  const parsedModel = parseProviderModelId({
    modelId: args.request.modelId,
  });
  if (parsedModel.providerId !== 'openai') {
    throw new HarnessProviderError({
      code: 'unsupported_provider',
      message: `OpenAI adapter cannot handle provider: ${parsedModel.providerId}.`,
    });
  }

  const baseUrl = args.config.baseUrl ?? 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: parsedModel.modelName,
      messages: args.request.messages.map((message) => ({
        role: message.role === 'tool' ? 'assistant' : message.role,
        content: message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n\n'),
      })),
      temperature: args.request.temperature,
      max_tokens: args.request.maxOutputTokens,
    }),
  });

  if (!response.ok) {
    throw mapOpenAiHttpError({
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
      message: 'Failed to parse OpenAI JSON response.',
      cause: error,
    });
  }

  const text = extractOpenAiText({ response: parsed });
  const usageObject = extractOpenAiUsage({ response: parsed });
  return {
    text,
    toolCalls: [],
    finishReason: extractOpenAiFinishReason({ response: parsed }),
    usage: usageObject,
    rawProviderResponse: parsed,
  };
}

/**
 * Maps OpenAI HTTP status codes into normalized harness provider errors.
 */
export function mapOpenAiHttpError(
  args: {
    status: number;
    bodyText: string;
  },
): HarnessProviderError {
  if (args.status === 400) {
    return new HarnessProviderError({
      code: 'bad_request',
      message: args.bodyText || 'OpenAI rejected request payload.',
    });
  }

  if (args.status === 401 || args.status === 403) {
    return new HarnessProviderError({
      code: 'unauthorized',
      message: args.bodyText || 'OpenAI authentication failed.',
    });
  }

  if (args.status === 429) {
    return new HarnessProviderError({
      code: 'rate_limited',
      message: args.bodyText || 'OpenAI rate limit exceeded.',
    });
  }

  if (args.status >= 500) {
    return new HarnessProviderError({
      code: 'provider_internal',
      message: args.bodyText || 'OpenAI provider internal error.',
    });
  }

  return new HarnessProviderError({
    code: 'unavailable',
    message: args.bodyText || `OpenAI request failed with status ${args.status}.`,
  });
}

/**
 * Extracts assistant text content from one OpenAI chat-completions response.
 */
export function extractOpenAiText(
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
 * Extracts normalized usage information from one OpenAI response payload.
 */
export function extractOpenAiUsage(
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
 * Extracts one finish reason string from an OpenAI response when present.
 */
export function extractOpenAiFinishReason(
  args: {
    response: Record<string, unknown>;
  },
): string | undefined {
  const choices = args.response.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0];
  const finishReason = firstChoice?.finish_reason;
  return typeof finishReason === 'string' ? finishReason : undefined;
}
