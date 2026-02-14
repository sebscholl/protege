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
  whitelist: string[];
  providers: {
    openai?: {
      apiKey?: string;
      baseUrl?: string;
    };
    anthropic?: {
      apiKey?: string;
    };
    gemini?: {
      apiKey?: string;
    };
    grok?: {
      apiKey?: string;
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
 * Resolves the default local inference override path in repository config.
 */
export function resolveDefaultInferenceLocalConfigPath(): string {
  return join(process.cwd(), 'config', 'inference.local.json');
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
    localConfigPath?: string;
  } = {},
): InferenceRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultInferenceConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(`Inference config not found at ${configPath}`);
  }

  const localConfigPath = args.localConfigPath ?? resolveDefaultInferenceLocalConfigPath();
  const baseConfig = readJsonRecord({
    filePath: configPath,
  });
  const localConfig = existsSync(localConfigPath)
    ? readJsonRecord({ filePath: localConfigPath })
    : undefined;
  const parsed = mergeConfigRecords({
    base: baseConfig,
    overlay: localConfig,
  });

  if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') {
    throw new Error('Inference config must define string provider and model fields.');
  }

  return {
    provider: parsed.provider as HarnessProviderId,
    model: parsed.model,
    recursionDepth: Number(parsed.recursion_depth ?? 3),
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
 * Deep-merges base config with overlay config for local overrides.
 */
export function mergeConfigRecords(
  args: {
    base: Record<string, unknown>;
    overlay?: Record<string, unknown>;
  },
): Record<string, unknown> {
  if (!args.overlay) {
    return args.base;
  }

  const output: Record<string, unknown> = { ...args.base };
  for (const [key, value] of Object.entries(args.overlay)) {
    const baseValue = output[key];
    if (isPlainRecordValue(baseValue) && isPlainRecordValue(value)) {
      output[key] = mergeConfigRecords({
        base: baseValue,
        overlay: value,
      });
      continue;
    }

    output[key] = value;
  }

  return output;
}

/**
 * Returns true when value is a non-null plain object record.
 */
export function isPlainRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
          apiKey: readString({ value: openai.api_key }),
          baseUrl: readString({ value: openai.base_url }),
        }
      : undefined,
    anthropic: anthropic
      ? {
          apiKey: readString({ value: anthropic.api_key }),
        }
      : undefined,
    gemini: gemini
      ? {
          apiKey: readString({ value: gemini.api_key }),
        }
      : undefined,
    grok: grok
      ? {
          apiKey: readString({ value: grok.api_key }),
        }
      : undefined,
  };
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
