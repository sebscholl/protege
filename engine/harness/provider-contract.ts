/**
 * Enumerates provider identifiers supported by Protege v1.
 */
export type HarnessProviderId = 'openai' | 'anthropic' | 'gemini' | 'grok';

/**
 * Enumerates normalized provider capabilities used by harness orchestration.
 */
export type HarnessProviderCapability = 'tools' | 'structured_output' | 'streaming';

/**
 * Represents normalized capability flags exposed by one provider adapter.
 */
export type HarnessProviderCapabilities = {
  tools: boolean;
  structuredOutput: boolean;
  streaming: boolean;
};

/**
 * Represents one normalized provider model id in provider/model format.
 */
export type HarnessProviderModelId = `${HarnessProviderId}/${string}`;

/**
 * Represents one normalized chat role in provider-independent prompts.
 */
export type HarnessProviderRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Represents one normalized message part in provider-independent prompts.
 */
export type HarnessProviderMessagePart = {
  type: 'text';
  text: string;
};

/**
 * Represents one normalized provider message in harness request context.
 */
export type HarnessProviderMessage = {
  role: HarnessProviderRole;
  parts: HarnessProviderMessagePart[];
  toolCallId?: string;
};

/**
 * Represents one normalized provider tool declaration.
 */
export type HarnessProviderTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * Represents one tool call emitted by a provider response.
 */
export type HarnessProviderToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

/**
 * Represents one normalized provider usage payload.
 */
export type HarnessProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/**
 * Represents one normalized provider generation request.
 */
export type HarnessProviderGenerateRequest = {
  modelId: HarnessProviderModelId;
  messages: HarnessProviderMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  tools?: HarnessProviderTool[];
  structuredOutputSchema?: Record<string, unknown>;
};

/**
 * Represents one normalized provider generation response.
 */
export type HarnessProviderGenerateResponse = {
  text?: string;
  toolCalls: HarnessProviderToolCall[];
  structuredOutput?: Record<string, unknown>;
  finishReason?: string;
  usage?: HarnessProviderUsage;
  rawProviderResponse?: unknown;
};

/**
 * Enumerates stable provider error codes for normalized error handling.
 */
export type HarnessProviderErrorCode =
  | 'unsupported_provider'
  | 'unsupported_capability'
  | 'invalid_model_id'
  | 'bad_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'provider_internal'
  | 'response_parse_failed';

/**
 * Represents one normalized provider error with a stable taxonomy code.
 */
export class HarnessProviderError extends Error {
  public readonly code: HarnessProviderErrorCode;

  public constructor(
    args: {
      code: HarnessProviderErrorCode;
      message: string;
      cause?: unknown;
    },
  ) {
    super(args.message);
    this.code = args.code;
    this.cause = args.cause;
  }
}

/**
 * Represents one provider adapter contract implemented by each provider module.
 */
export type HarnessProviderAdapter = {
  readonly providerId: HarnessProviderId;
  readonly capabilities: HarnessProviderCapabilities;
  generate: (
    args: {
      request: HarnessProviderGenerateRequest;
    },
  ) => Promise<HarnessProviderGenerateResponse>;
};

/**
 * Parses a normalized provider/model id and returns provider and model segments.
 */
export function parseProviderModelId(
  args: {
    modelId: string;
  },
): {
  providerId: HarnessProviderId;
  modelName: string;
} {
  const [providerId, ...rest] = args.modelId.split('/');
  const modelName = rest.join('/').trim();
  if (!isSupportedProviderId({ providerId }) || modelName.length === 0) {
    throw new HarnessProviderError({
      code: 'invalid_model_id',
      message: `Invalid model id: ${args.modelId}. Expected provider/model.`,
    });
  }

  return {
    providerId: providerId as HarnessProviderId,
    modelName,
  };
}

/**
 * Returns true when one provider id is supported in Protege v1.
 */
export function isSupportedProviderId(
  args: {
    providerId: string;
  },
): args is { providerId: HarnessProviderId } {
  return args.providerId === 'openai'
    || args.providerId === 'anthropic'
    || args.providerId === 'gemini'
    || args.providerId === 'grok';
}

/**
 * Asserts one required capability flag and throws typed errors when unsupported.
 */
export function assertProviderCapability(
  args: {
    capability: HarnessProviderCapability;
    capabilities: HarnessProviderCapabilities;
    providerId: HarnessProviderId;
  },
): void {
  const enabled = args.capability === 'tools'
    ? args.capabilities.tools
    : args.capability === 'structured_output'
      ? args.capabilities.structuredOutput
      : args.capabilities.streaming;
  if (enabled) {
    return;
  }

  throw new HarnessProviderError({
    code: 'unsupported_capability',
    message: `Provider ${args.providerId} does not support capability: ${args.capability}.`,
  });
}
