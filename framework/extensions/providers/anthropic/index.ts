import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
  HarnessProviderMessage,
} from '@protege-pack/toolkit';

import {
  HarnessProviderError,
  parseProviderModelId,
} from '@protege-pack/toolkit';

/**
 * Represents one Anthropic adapter runtime dependency configuration.
 */
export type AnthropicAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
  version?: string;
};

/**
 * Represents one serialized Anthropic message content block.
 */
export type AnthropicContentBlock = {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
};

/**
 * Represents one serialized Anthropic messages API payload entry.
 */
export type AnthropicMessagePayload = {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
};

/**
 * Creates one Anthropic provider adapter using normalized harness contracts.
 */
export function createAnthropicProviderAdapter(
  args: {
    config: AnthropicAdapterConfig;
  },
): HarnessProviderAdapter {
  return {
    providerId: 'anthropic',
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
      return generateWithAnthropic({
        request: adapterArgs.request,
        config: args.config,
      });
    },
  };
}

/**
 * Executes one Anthropic messages request using normalized harness payload.
 */
export async function generateWithAnthropic(
  args: {
    request: HarnessProviderGenerateRequest;
    config: AnthropicAdapterConfig;
  },
): Promise<HarnessProviderGenerateResponse> {
  const parsedModel = parseProviderModelId({
    modelId: args.request.modelId,
  });
  if (parsedModel.providerId !== 'anthropic') {
    throw new HarnessProviderError({
      code: 'unsupported_provider',
      message: `Anthropic adapter cannot handle provider: ${parsedModel.providerId}.`,
    });
  }

  const baseUrl = args.config.baseUrl ?? 'https://api.anthropic.com/v1';
  const systemPrompt = extractAnthropicSystemPrompt({
    messages: args.request.messages,
  });
  const messages = sanitizeAnthropicMessages({
    messages: args.request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => buildAnthropicMessage({
        message,
      })),
  });
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': args.config.apiKey,
      'anthropic-version': args.config.version ?? '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: parsedModel.modelName,
      max_tokens: args.request.maxOutputTokens ?? 1024,
      temperature: args.request.temperature,
      system: systemPrompt.length > 0 ? systemPrompt : undefined,
      messages,
      tools: args.request.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    }),
  });

  if (!response.ok) {
    throw mapAnthropicHttpError({
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
      message: 'Failed to parse Anthropic JSON response.',
      cause: error,
    });
  }

  const text = extractAnthropicText({ response: parsed });
  const toolCalls = extractAnthropicToolCalls({ response: parsed });
  const usage = extractAnthropicUsage({ response: parsed });
  return {
    text,
    toolCalls,
    finishReason: extractAnthropicFinishReason({ response: parsed }),
    usage,
    rawProviderResponse: parsed,
  };
}

/**
 * Builds one Anthropic system prompt string from normalized system-role messages.
 */
export function extractAnthropicSystemPrompt(
  args: {
    messages: HarnessProviderMessage[];
  },
): string {
  return args.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n\n'))
    .filter((entry) => entry.trim().length > 0)
    .join('\n\n');
}

/**
 * Serializes one normalized harness message into an Anthropic messages payload entry.
 */
export function buildAnthropicMessage(
  args: {
    message: HarnessProviderMessage;
  },
): AnthropicMessagePayload | undefined {
  if (args.message.role === 'assistant') {
    const content = buildAnthropicAssistantBlocks({
      message: args.message,
    });
    if (content.length === 0) {
      return undefined;
    }

    return {
      role: 'assistant',
      content,
    };
  }

  if (args.message.role === 'tool') {
    if (!args.message.toolCallId) {
      throw new HarnessProviderError({
        code: 'bad_request',
        message: 'Tool result message is missing toolCallId.',
      });
    }

    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: args.message.toolCallId,
        content: args.message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n\n'),
      }],
    };
  }

  const text = args.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
  if (text.length === 0) {
    return undefined;
  }

  return {
    role: 'user',
    content: [{
      type: 'text',
      text,
    }],
  };
}

/**
 * Builds Anthropic assistant content blocks from text and tool calls.
 */
export function buildAnthropicAssistantBlocks(
  args: {
    message: HarnessProviderMessage;
  },
): AnthropicContentBlock[] {
  const text = args.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
  const blocks: AnthropicContentBlock[] = [];
  if (text.length > 0) {
    blocks.push({
      type: 'text',
      text,
    });
  }

  for (const toolCall of args.message.toolCalls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
    });
  }

  return blocks;
}

/**
 * Filters Anthropic payload messages and removes invalid empty text blocks.
 */
export function sanitizeAnthropicMessages(
  args: {
    messages: Array<AnthropicMessagePayload | undefined>;
  },
): AnthropicMessagePayload[] {
  return args.messages
    .filter((message): message is AnthropicMessagePayload => message !== undefined)
    .map((message) => ({
      ...message,
      content: message.content.filter((block) => block.type !== 'text' || (block.text?.trim().length ?? 0) > 0),
    }))
    .filter((message) => message.content.length > 0);
}

/**
 * Extracts normalized tool-call payloads from one Anthropic messages response.
 */
export function extractAnthropicToolCalls(
  args: {
    response: Record<string, unknown>;
  },
): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  const content = args.response.content;
  if (!Array.isArray(content)) {
    return [];
  }

  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }

    const record = block as Record<string, unknown>;
    if (record.type !== 'tool_use') {
      continue;
    }

    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name : '';
    const input = parseAnthropicToolInput({
      value: record.input,
    });
    if (id.length === 0 || name.length === 0) {
      continue;
    }

    toolCalls.push({
      id,
      name,
      input,
    });
  }

  return toolCalls;
}

/**
 * Extracts assistant text content from one Anthropic messages response.
 */
export function extractAnthropicText(
  args: {
    response: Record<string, unknown>;
  },
): string {
  const content = args.response.content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
    .filter((block) => block.type === 'text')
    .map((block) => typeof block.text === 'string' ? block.text : '')
    .filter((block) => block.length > 0)
    .join('\n\n');
}

/**
 * Extracts one normalized finish-reason from an Anthropic response payload.
 */
export function extractAnthropicFinishReason(
  args: {
    response: Record<string, unknown>;
  },
): string | undefined {
  return typeof args.response.stop_reason === 'string'
    ? args.response.stop_reason
    : undefined;
}

/**
 * Extracts normalized usage information from one Anthropic response payload.
 */
export function extractAnthropicUsage(
  args: {
    response: Record<string, unknown>;
  },
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined {
  const usage = args.response.usage;
  if (!isRecord({ value: usage })) {
    return undefined;
  }
  const usageRecord = usage as Record<string, unknown>;

  const inputTokens = typeof usageRecord.input_tokens === 'number' ? usageRecord.input_tokens : undefined;
  const outputTokens = typeof usageRecord.output_tokens === 'number' ? usageRecord.output_tokens : undefined;
  const totalTokens = inputTokens !== undefined && outputTokens !== undefined
    ? inputTokens + outputTokens
    : undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

/**
 * Maps Anthropic HTTP status codes into normalized harness provider errors.
 */
export function mapAnthropicHttpError(
  args: {
    status: number;
    bodyText: string;
  },
): HarnessProviderError {
  if (args.status === 400) {
    return new HarnessProviderError({
      code: 'bad_request',
      message: args.bodyText || 'Anthropic rejected request payload.',
    });
  }

  if (args.status === 401 || args.status === 403) {
    return new HarnessProviderError({
      code: 'unauthorized',
      message: args.bodyText || 'Anthropic authentication failed.',
    });
  }

  if (args.status === 429) {
    return new HarnessProviderError({
      code: 'rate_limited',
      message: args.bodyText || 'Anthropic rate limit exceeded.',
    });
  }

  if (args.status >= 500) {
    return new HarnessProviderError({
      code: 'provider_internal',
      message: args.bodyText || 'Anthropic provider internal error.',
    });
  }

  return new HarnessProviderError({
    code: 'unavailable',
    message: args.bodyText || `Anthropic request failed with status ${args.status}.`,
  });
}

/**
 * Returns true when one value is a plain object record.
 */
export function isRecord(
  args: {
    value: unknown;
  },
): args is { value: Record<string, unknown> } {
  return typeof args.value === 'object'
    && args.value !== null
    && !Array.isArray(args.value);
}

/**
 * Parses one Anthropic tool input payload into a normalized object record.
 */
export function parseAnthropicToolInput(
  args: {
    value: unknown;
  },
): Record<string, unknown> {
  if (isRecord({ value: args.value })) {
    return args.value as Record<string, unknown>;
  }

  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(args.value) as unknown;
    return isRecord({ value: parsed }) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
