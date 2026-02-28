import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HarnessProviderId } from '@engine/harness/provider-contract';

/**
 * Represents one typed inference runtime configuration.
 */
export type InferenceRuntimeConfig = {
  provider: HarnessProviderId;
  model: string;
  recursionDepth: number;
  maxToolTurns: number;
  whitelist: string[];
  providers: {
    openai?: {
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
    };
    anthropic?: {
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
      version?: string;
    };
    gemini?: {
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
    };
    grok?: {
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
    };
  };
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * Resolves the default inference config path in repository config.
 */
export function resolveDefaultInferenceConfigPath(): string {
  return join(process.cwd(), 'config', 'inference.json');
}

/**
 * Resolves the default system prompt path in repository config.
 */
export function resolveDefaultSystemPromptPath(): string {
  return join(process.cwd(), 'config', 'system-prompt.md');
}

/**
 * Reads inference runtime config from disk and validates required fields.
 */
export function readInferenceRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): InferenceRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultInferenceConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(`Inference config not found at ${configPath}`);
  }

  const parsed = readJsonRecord({
    filePath: configPath,
  });

  if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') {
    throw new Error('Inference config must define string provider and model fields.');
  }

  return {
    provider: parsed.provider as HarnessProviderId,
    model: parsed.model,
    recursionDepth: Number(parsed.recursion_depth ?? 3),
    maxToolTurns: readPositiveInteger({
      value: parsed.max_tool_turns,
      fallback: 8,
    }),
    whitelist: Array.isArray(parsed.whitelist) ? parsed.whitelist as string[] : [],
    providers: parseProviderSettings({
      providers: parsed.providers,
    }),
    temperature: typeof parsed.temperature === 'number' ? parsed.temperature : undefined,
    maxOutputTokens: typeof parsed.max_output_tokens === 'number'
      ? parsed.max_output_tokens
      : undefined,
  };
}

/**
 * Reads one positive integer config value with fallback when invalid or absent.
 */
export function readPositiveInteger(
  args: {
    value: unknown;
    fallback: number;
  },
): number {
  return typeof args.value === 'number' && Number.isInteger(args.value) && args.value > 0
    ? args.value
    : args.fallback;
}

/**
 * Reads one JSON file and returns it as a generic record.
 */
export function readJsonRecord(
  args: {
    filePath: string;
  },
): Record<string, unknown> {
  const text = readFileSync(args.filePath, 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Parses provider-specific inference settings from config json shape.
 */
export function parseProviderSettings(
  args: {
    providers: unknown;
  },
): InferenceRuntimeConfig['providers'] {
  const providers = asRecord({ value: args.providers });
  const openai = asRecord({ value: providers?.openai });
  const anthropic = asRecord({ value: providers?.anthropic });
  const gemini = asRecord({ value: providers?.gemini });
  const grok = asRecord({ value: providers?.grok });

  return {
    openai: openai
      ? {
          apiKey: resolveApiKey({
            providerName: 'openai',
            providerConfig: openai,
          }),
          apiKeyEnv: readString({ value: openai.api_key_env }),
          baseUrl: readString({ value: openai.base_url }),
        }
      : undefined,
    anthropic: anthropic
      ? {
          apiKey: resolveApiKey({
            providerName: 'anthropic',
            providerConfig: anthropic,
          }),
          apiKeyEnv: readString({ value: anthropic.api_key_env }),
          baseUrl: readString({ value: anthropic.base_url }),
          version: readString({ value: anthropic.version }),
        }
      : undefined,
    gemini: gemini
      ? {
          apiKey: resolveApiKey({
            providerName: 'gemini',
            providerConfig: gemini,
          }),
          apiKeyEnv: readString({ value: gemini.api_key_env }),
          baseUrl: readString({ value: gemini.base_url }),
        }
      : undefined,
    grok: grok
      ? {
          apiKey: resolveApiKey({
            providerName: 'grok',
            providerConfig: grok,
          }),
          apiKeyEnv: readString({ value: grok.api_key_env }),
          baseUrl: readString({ value: grok.base_url }),
        }
      : undefined,
  };
}

/**
 * Resolves one provider API key from literal config or env-key indirection.
 */
export function resolveApiKey(
  args: {
    providerName: string;
    providerConfig: Record<string, unknown>;
  },
): string | undefined {
  const directApiKey = readString({
    value: args.providerConfig.api_key,
  });
  if (directApiKey) {
    return directApiKey;
  }

  const apiKeyEnv = readString({
    value: args.providerConfig.api_key_env,
  });
  if (!apiKeyEnv) {
    return undefined;
  }

  const envValue = process.env[apiKeyEnv];
  return typeof envValue === 'string' && envValue.trim().length > 0
    ? envValue
    : undefined;
}

/**
 * Returns value as record when input is a plain object.
 */
export function asRecord(
  args: {
    value: unknown;
  },
): Record<string, unknown> | undefined {
  return typeof args.value === 'object'
    && args.value !== null
    && !Array.isArray(args.value)
    ? args.value as Record<string, unknown>
    : undefined;
}

/**
 * Returns a string when value is a non-empty string, otherwise undefined.
 */
export function readString(
  args: {
    value: unknown;
  },
): string | undefined {
  return typeof args.value === 'string' && args.value.trim().length > 0
    ? args.value
    : undefined;
}

/**
 * Loads system prompt text from disk and returns an empty string when absent.
 */
export function loadSystemPrompt(
  args: {
    systemPromptPath?: string;
  } = {},
): string {
  const systemPromptPath = args.systemPromptPath ?? resolveDefaultSystemPromptPath();
  if (!existsSync(systemPromptPath)) {
    return '';
  }

  return readFileSync(systemPromptPath, 'utf8').trim();
}
