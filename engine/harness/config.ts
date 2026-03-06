import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HarnessProviderId } from '@engine/harness/providers/contract';

/**
 * Represents one typed inference runtime configuration.
 */
export type InferenceRuntimeConfig = {
  provider: HarnessProviderId;
  model: string;
  recursionDepth: number;
  maxToolTurns: number;
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * Resolves the default inference config path in repository config.
 */
export function resolveDefaultInferenceConfigPath(): string {
  return join(process.cwd(), 'configs', 'inference.json');
}

/**
 * Resolves the default system prompt path in repository prompts.
 */
export function resolveDefaultSystemPromptPath(): string {
  return join(process.cwd(), 'prompts', 'system.md');
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
