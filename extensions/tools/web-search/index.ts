import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege/toolkit';

/**
 * Represents the supported web search provider names in v1.
 */
export type WebSearchProviderName = 'tavily' | 'perplexity';

/**
 * Represents one provider configuration entry for web search.
 */
export type WebSearchProviderConfig = {
  apiKeyEnv: string;
  baseUrl?: string;
};

/**
 * Represents one web search tool configuration shape.
 */
export type WebSearchToolConfig = {
  provider: WebSearchProviderName;
  defaultMaxResults?: number;
  providers: Record<string, WebSearchProviderConfig>;
};

/**
 * Represents accepted input payload for web search tool execution.
 */
export type WebSearchToolInput = {
  query: string;
  maxResults?: number;
};

/**
 * Represents one typed validation error for invalid web search inputs.
 */
export class WebSearchToolInputError extends Error {}

/**
 * Default web_search configuration used when no manifest override is provided.
 */
export const defaultWebSearchToolConfig: WebSearchToolConfig = {
  provider: 'perplexity',
  defaultMaxResults: 5,
  providers: {
    perplexity: {
      apiKeyEnv: 'PERPLEXITY_API_KEY',
      baseUrl: 'https://api.perplexity.ai',
    },
    tavily: {
      apiKeyEnv: 'TAVILY_API_KEY',
      baseUrl: 'https://api.tavily.com',
    },
  },
};

/**
 * Creates one web_search tool definition with default and override config support.
 */
export function createWebSearchTool(
  args: {
    configOverride?: Record<string, unknown>;
  } = {},
): HarnessToolDefinition {
  const effectiveConfig = resolveWebSearchToolConfig({
    configOverride: args.configOverride,
  });

  return {
    name: 'web_search',
    description: 'Search the web for relevant results using the configured provider.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => executeWebSearchTool({
      input: executeArgs.input,
      context: executeArgs.context,
      config: effectiveConfig,
    }),
  };
}

/**
 * Resolves normalized web_search config from defaults and optional manifest override.
 */
export function resolveWebSearchToolConfig(
  args: {
    configOverride?: Record<string, unknown>;
  },
): WebSearchToolConfig {
  const mergedConfig = mergeRecordWithOverride({
    base: defaultWebSearchToolConfig as unknown as Record<string, unknown>,
    override: args.configOverride,
  });

  return normalizeWebSearchToolConfig({
    value: mergedConfig,
  });
}

/**
 * Executes web search through runtime-provided web.search action.
 */
export async function executeWebSearchTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
    config: WebSearchToolConfig;
  },
): Promise<Record<string, unknown>> {
  const normalizedInput = normalizeWebSearchInput({
    input: args.input,
  });
  const providerConfig = readConfiguredProvider({
    config: args.config,
  });
  const apiKey = readRequiredEnvValue({
    envKey: providerConfig.apiKeyEnv,
  });
  const result = await args.context.runtime.invoke({
    action: 'web.search',
    payload: {
      provider: args.config.provider,
      query: normalizedInput.query,
      maxResults: normalizedInput.maxResults ?? args.config.defaultMaxResults,
      apiKey,
      baseUrl: providerConfig.baseUrl,
    },
  });
  args.context.logger?.info({
    event: 'harness.tool.web_search.completed',
    context: {
      provider: args.config.provider,
      query: normalizedInput.query,
      totalReturned: typeof result.totalReturned === 'number' ? result.totalReturned : null,
    },
  });
  return result;
}

/**
 * Normalizes and validates one raw web search input payload.
 */
export function normalizeWebSearchInput(
  args: {
    input: Record<string, unknown>;
  },
): WebSearchToolInput {
  const query = readRequiredString({
    value: args.input.query,
    fieldName: 'query',
  });
  const maxResults = readOptionalPositiveInteger({
    value: args.input.maxResults,
    fieldName: 'maxResults',
  });
  return {
    query,
    maxResults,
  };
}

/**
 * Reads one configured provider entry from normalized tool config.
 */
export function readConfiguredProvider(
  args: {
    config: WebSearchToolConfig;
  },
): WebSearchProviderConfig {
  const providerConfig = args.config.providers[args.config.provider];
  if (!providerConfig) {
    throw new WebSearchToolInputError(`web_search provider "${args.config.provider}" is not configured.`);
  }

  return providerConfig;
}

/**
 * Reads one required environment variable for provider credential resolution.
 */
export function readRequiredEnvValue(
  args: {
    envKey: string;
  },
): string {
  const value = process.env[args.envKey];
  if (!value || value.trim().length === 0) {
    throw new WebSearchToolInputError(`web_search requires environment variable "${args.envKey}".`);
  }

  return value;
}

/**
 * Normalizes and validates one parsed web-search config object.
 */
export function normalizeWebSearchToolConfig(
  args: {
    value: unknown;
  },
): WebSearchToolConfig {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    throw new WebSearchToolInputError('web_search config must be an object.');
  }
  const record = args.value as Record<string, unknown>;
  const provider = readRequiredProviderName({
    value: record.provider,
  });
  const providers = readProvidersRecord({
    value: record.providers,
  });
  const defaultMaxResults = readOptionalPositiveInteger({
    value: record.defaultMaxResults,
    fieldName: 'defaultMaxResults',
  });
  return {
    provider,
    providers,
    defaultMaxResults,
  };
}

/**
 * Reads and validates one provider name.
 */
export function readRequiredProviderName(
  args: {
    value: unknown;
  },
): WebSearchProviderName {
  if (args.value === 'tavily' || args.value === 'perplexity') {
    return args.value;
  }

  throw new WebSearchToolInputError('web_search config field "provider" must be "tavily" or "perplexity".');
}

/**
 * Reads and validates one providers dictionary record.
 */
export function readProvidersRecord(
  args: {
    value: unknown;
  },
): Record<string, WebSearchProviderConfig> {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    throw new WebSearchToolInputError('web_search config field "providers" must be an object.');
  }

  const providers: Record<string, WebSearchProviderConfig> = {};
  for (const [providerName, providerValue] of Object.entries(args.value)) {
    if (typeof providerValue !== 'object' || providerValue === null || Array.isArray(providerValue)) {
      throw new WebSearchToolInputError(`web_search config provider "${providerName}" must be an object.`);
    }

    const providerRecord = providerValue as Record<string, unknown>;
    const apiKeyEnv = readRequiredString({
      value: providerRecord.apiKeyEnv,
      fieldName: `${providerName}.apiKeyEnv`,
    });
    const baseUrl = readOptionalString({
      value: providerRecord.baseUrl,
    });
    providers[providerName] = {
      apiKeyEnv,
      baseUrl,
    };
  }

  return providers;
}

/**
 * Deep merges two record values with array replacement semantics for override values.
 */
export function mergeRecordWithOverride(
  args: {
    base: Record<string, unknown>;
    override: Record<string, unknown> | undefined;
  },
): Record<string, unknown> {
  if (!args.override) {
    return { ...args.base };
  }

  const merged: Record<string, unknown> = { ...args.base };
  for (const [key, overrideValue] of Object.entries(args.override)) {
    const baseValue = merged[key];
    if (Array.isArray(overrideValue)) {
      merged[key] = [...overrideValue];
      continue;
    }
    if (isRecord(baseValue) && isRecord(overrideValue)) {
      merged[key] = mergeRecordWithOverride({
        base: baseValue,
        override: overrideValue,
      });
      continue;
    }

    merged[key] = overrideValue;
  }

  return merged;
}

/**
 * Returns true when one unknown value is a non-null non-array record.
 */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

/**
 * Reads one required non-empty string field.
 */
export function readRequiredString(
  args: {
    value: unknown;
    fieldName: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new WebSearchToolInputError(`web_search field "${args.fieldName}" is required.`);
  }

  return args.value;
}

/**
 * Reads one optional non-empty string field.
 */
export function readOptionalString(
  args: {
    value: unknown;
  },
): string | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new WebSearchToolInputError('web_search optional string field must be non-empty when provided.');
  }

  return args.value;
}

/**
 * Reads one optional positive integer field.
 */
export function readOptionalPositiveInteger(
  args: {
    value: unknown;
    fieldName: string;
  },
): number | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value !== 'number' || !Number.isInteger(args.value) || args.value <= 0) {
    throw new WebSearchToolInputError(`web_search field "${args.fieldName}" must be a positive integer.`);
  }

  return args.value;
}

/**
 * Exports the web search tool module contract consumed by harness registry loading.
 */
export const tool = createWebSearchTool();
