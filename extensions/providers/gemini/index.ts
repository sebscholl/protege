import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
  HarnessProviderMessage,
  HarnessProviderToolCall,
} from 'protege/toolkit';

import {
  HarnessProviderError,
  parseProviderModelId,
} from 'protege/toolkit';

/**
 * Represents one Gemini adapter runtime dependency configuration.
 */
export type GeminiAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Represents one serialized Gemini content part payload.
 */
export type GeminiContentPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    id?: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
};

/**
 * Represents one serialized Gemini generate-content message payload entry.
 */
export type GeminiContentPayload = {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
};

/**
 * Creates one Gemini provider adapter using normalized harness contracts.
 */
export function createGeminiProviderAdapter(
  args: {
    config: GeminiAdapterConfig;
  },
): HarnessProviderAdapter {
  return {
    providerId: 'gemini',
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
      return generateWithGemini({
        request: adapterArgs.request,
        config: args.config,
      });
    },
  };
}

/**
 * Executes one Gemini generate-content request using normalized harness payload.
 */
export async function generateWithGemini(
  args: {
    request: HarnessProviderGenerateRequest;
    config: GeminiAdapterConfig;
  },
): Promise<HarnessProviderGenerateResponse> {
  const parsedModel = parseProviderModelId({
    modelId: args.request.modelId,
  });
  if (parsedModel.providerId !== 'gemini') {
    throw new HarnessProviderError({
      code: 'unsupported_provider',
      message: `Gemini adapter cannot handle provider: ${parsedModel.providerId}.`,
    });
  }

  const baseUrl = args.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/${parsedModel.modelName}:generateContent?key=${encodeURIComponent(args.config.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: buildGeminiContents({
        messages: args.request.messages,
      }),
      tools: buildGeminiTools({
        request: args.request,
      }),
      generationConfig: {
        temperature: args.request.temperature,
        maxOutputTokens: args.request.maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    throw mapGeminiHttpError({
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
      message: 'Failed to parse Gemini JSON response.',
      cause: error,
    });
  }

  return {
    text: extractGeminiText({ response: parsed }),
    toolCalls: extractGeminiToolCalls({ response: parsed }),
    finishReason: extractGeminiFinishReason({ response: parsed }),
    usage: extractGeminiUsage({ response: parsed }),
    rawProviderResponse: parsed,
  };
}

/**
 * Builds one Gemini tools payload from normalized request declarations.
 */
export function buildGeminiTools(
  args: {
    request: HarnessProviderGenerateRequest;
  },
): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}> | undefined {
  if (!args.request.tools || args.request.tools.length === 0) {
    return undefined;
  }

  return [{
    functionDeclarations: args.request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: sanitizeGeminiSchema({
        schema: tool.inputSchema,
      }),
    })),
  }];
}

/**
 * Removes unsupported Gemini function-schema fields recursively.
 */
export function sanitizeGeminiSchema(
  args: {
    schema: Record<string, unknown>;
  },
): Record<string, unknown> {
  return sanitizeGeminiValue({
    value: args.schema,
  });
}

/**
 * Serializes normalized messages into Gemini content payload entries.
 */
export function buildGeminiContents(
  args: {
    messages: HarnessProviderMessage[];
  },
): GeminiContentPayload[] {
  const payloads: GeminiContentPayload[] = [];

  for (const message of args.messages) {
    if (message.role === 'system') {
      const systemText = joinMessageText({
        message,
      });
      if (systemText.length > 0) {
        payloads.push({
          role: 'user',
          parts: [{ text: `System instructions:\n${systemText}` }],
        });
      }
      continue;
    }

    if (message.role === 'assistant') {
      const parts: GeminiContentPart[] = [];
      const text = joinMessageText({
        message,
      });
      if (text.length > 0) {
        parts.push({ text });
      }
      for (const toolCall of message.toolCalls ?? []) {
        const metadata = decodeGeminiToolCallId({
          toolCallId: toolCall.id,
        });
        parts.push({
          thoughtSignature: metadata.thoughtSignature,
          functionCall: {
            name: toolCall.name,
            id: metadata.providerCallId,
            args: toolCall.input,
          },
        });
      }
      if (parts.length > 0) {
        payloads.push({
          role: 'model',
          parts,
        });
      }
      continue;
    }

    if (message.role === 'tool') {
      const metadata = decodeGeminiToolCallId({
        toolCallId: message.toolCallId ?? '',
      });
      const toolName = metadata.name;
      const toolResult = parseToolResultJson({
        text: joinMessageText({
          message,
        }),
      });
      if (toolName) {
        payloads.push({
          role: 'user',
          parts: [{
            functionResponse: {
              id: metadata.providerCallId,
              name: toolName,
              response: {
                result: toolResult,
              },
            },
          }],
        });
      } else if (typeof toolResult === 'string' && toolResult.length > 0) {
        payloads.push({
          role: 'user',
          parts: [{ text: toolResult }],
        });
      }
      continue;
    }

    const userText = joinMessageText({
      message,
    });
    if (userText.length > 0) {
      payloads.push({
        role: 'user',
        parts: [{ text: userText }],
      });
    }
  }

  return payloads;
}

/**
 * Joins one normalized message text-part set into a single text block.
 */
export function joinMessageText(
  args: {
    message: HarnessProviderMessage;
  },
): string {
  return args.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
}

/**
 * Parses serialized tool result JSON and falls back to literal text when invalid.
 */
export function parseToolResultJson(
  args: {
    text: string;
  },
): Record<string, unknown> | string {
  if (args.text.length === 0) {
    return '';
  }

  try {
    const parsed = JSON.parse(args.text) as unknown;
    if (isRecord({ value: parsed })) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return args.text;
  }

  return args.text;
}

/**
 * Extracts normalized tool-call payloads from one Gemini response payload.
 */
export function extractGeminiToolCalls(
  args: {
    response: Record<string, unknown>;
  },
): HarnessProviderToolCall[] {
  const parts = extractGeminiCandidateParts({
    response: args.response,
  });
  const toolCalls: HarnessProviderToolCall[] = [];
  for (const part of parts) {
    const functionCall = part.functionCall;
    if (!isRecord({ value: functionCall })) {
      continue;
    }

    const functionCallRecord = functionCall as Record<string, unknown>;
    const name = typeof functionCallRecord.name === 'string' ? functionCallRecord.name : '';
    const providerCallId = typeof functionCallRecord.id === 'string'
      ? functionCallRecord.id
      : undefined;
    const thoughtSignature = typeof part.thoughtSignature === 'string'
      ? part.thoughtSignature
      : undefined;
    const argsObject = isRecord({ value: functionCallRecord.args })
      ? functionCallRecord.args as Record<string, unknown>
      : {};
    if (name.length === 0) {
      continue;
    }

    toolCalls.push({
      id: encodeGeminiToolCallId({
        name,
        sequence: toolCalls.length + 1,
        providerCallId,
        thoughtSignature,
      }),
      name,
      input: argsObject,
    });
  }

  return toolCalls;
}

/**
 * Extracts assistant text content from one Gemini response payload.
 */
export function extractGeminiText(
  args: {
    response: Record<string, unknown>;
  },
): string {
  const parts = extractGeminiCandidateParts({
    response: args.response,
  });
  return parts
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * Extracts one normalized finish-reason from a Gemini response payload.
 */
export function extractGeminiFinishReason(
  args: {
    response: Record<string, unknown>;
  },
): string | undefined {
  const candidates = args.response.candidates;
  if (!Array.isArray(candidates)) {
    return undefined;
  }

  const firstCandidate = candidates[0];
  if (!isRecord({ value: firstCandidate })) {
    return undefined;
  }

  return typeof firstCandidate.finishReason === 'string'
    ? firstCandidate.finishReason
    : undefined;
}

/**
 * Extracts normalized usage information from one Gemini response payload.
 */
export function extractGeminiUsage(
  args: {
    response: Record<string, unknown>;
  },
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined {
  const usageMetadata = args.response.usageMetadata;
  if (!isRecord({ value: usageMetadata })) {
    return undefined;
  }
  const usageRecord = usageMetadata as Record<string, unknown>;

  return {
    inputTokens: typeof usageRecord.promptTokenCount === 'number'
      ? usageRecord.promptTokenCount
      : undefined,
    outputTokens: typeof usageRecord.candidatesTokenCount === 'number'
      ? usageRecord.candidatesTokenCount
      : undefined,
    totalTokens: typeof usageRecord.totalTokenCount === 'number'
      ? usageRecord.totalTokenCount
      : undefined,
  };
}

/**
 * Maps Gemini HTTP status codes into normalized harness provider errors.
 */
export function mapGeminiHttpError(
  args: {
    status: number;
    bodyText: string;
  },
): HarnessProviderError {
  if (args.status === 400) {
    return new HarnessProviderError({
      code: 'bad_request',
      message: args.bodyText || 'Gemini rejected request payload.',
    });
  }

  if (args.status === 401 || args.status === 403) {
    return new HarnessProviderError({
      code: 'unauthorized',
      message: args.bodyText || 'Gemini authentication failed.',
    });
  }

  if (args.status === 429) {
    return new HarnessProviderError({
      code: 'rate_limited',
      message: args.bodyText || 'Gemini rate limit exceeded.',
    });
  }

  if (args.status >= 500) {
    return new HarnessProviderError({
      code: 'provider_internal',
      message: args.bodyText || 'Gemini provider internal error.',
    });
  }

  return new HarnessProviderError({
    code: 'unavailable',
    message: args.bodyText || `Gemini request failed with status ${args.status}.`,
  });
}

/**
 * Extracts first-candidate parts from one Gemini response payload.
 */
export function extractGeminiCandidateParts(
  args: {
    response: Record<string, unknown>;
  },
): Array<{
  text?: unknown;
  thoughtSignature?: unknown;
  functionCall?: unknown;
}> {
  const candidates = args.response.candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }

  const firstCandidate = candidates[0];
  if (!isRecord({ value: firstCandidate })) {
    return [];
  }

  const content = firstCandidate.content;
  if (!isRecord({ value: content })) {
    return [];
  }

  const parts = content.parts;
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts
    .filter((part): part is Record<string, unknown> => isRecord({ value: part }))
    .map((part) => ({
      text: part.text,
      thoughtSignature: part.thoughtSignature,
      functionCall: part.functionCall,
    }));
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
 * Sanitizes unknown schema values into Gemini-compatible JSON object/array shapes.
 */
export function sanitizeGeminiValue(
  args: {
    value: unknown;
  },
): Record<string, unknown> {
  const value = args.value;
  if (!isRecord({ value })) {
    return {};
  }
  const recordValue = value as Record<string, unknown>;

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(recordValue)) {
    if (key === 'additionalProperties') {
      continue;
    }

    if (Array.isArray(rawValue)) {
      output[key] = rawValue.map((item) => {
        if (isRecord({ value: item })) {
          return sanitizeGeminiValue({
            value: item,
          });
        }

        return item;
      });
      continue;
    }

    if (isRecord({ value: rawValue })) {
      output[key] = sanitizeGeminiValue({
        value: rawValue,
      });
      continue;
    }

    output[key] = rawValue;
  }

  return output;
}

/**
 * Encodes Gemini-specific tool-call metadata into normalized tool-call ids.
 */
export function encodeGeminiToolCallId(
  args: {
    name: string;
    sequence: number;
    providerCallId?: string;
    thoughtSignature?: string;
  },
): string {
  const metadataJson = JSON.stringify({
    sequence: args.sequence,
    name: args.name,
    providerCallId: args.providerCallId,
    thoughtSignature: args.thoughtSignature,
  });
  const metadataToken = Buffer.from(metadataJson, 'utf8').toString('base64url');
  return `gemini:${metadataToken}`;
}

/**
 * Decodes normalized Gemini tool-call ids into provider-side metadata fields.
 */
export function decodeGeminiToolCallId(
  args: {
    toolCallId: string;
  },
): {
  name?: string;
  providerCallId?: string;
  thoughtSignature?: string;
} {
  if (!args.toolCallId.startsWith('gemini:')) {
    return {};
  }

  const metadataToken = args.toolCallId.slice('gemini:'.length);
  if (metadataToken.length === 0) {
    return {};
  }

  try {
    const metadataText = Buffer.from(metadataToken, 'base64url').toString('utf8');
    const metadata = JSON.parse(metadataText) as unknown;
    if (!isRecord({ value: metadata })) {
      return {};
    }
    const metadataRecord = metadata as Record<string, unknown>;

    return {
      name: typeof metadataRecord.name === 'string' ? metadataRecord.name : undefined,
      providerCallId: typeof metadataRecord.providerCallId === 'string'
        ? metadataRecord.providerCallId
        : undefined,
      thoughtSignature: typeof metadataRecord.thoughtSignature === 'string'
        ? metadataRecord.thoughtSignature
        : undefined,
    };
  } catch {
    return {};
  }
}
