import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readInferenceRuntimeConfig } from '@engine/harness/config';

let tempRootPath = '';
let parsedOpenAiApiKey = '';
let parsedOpenAiBaseUrl = '';
let parsedOverrideModel = '';
let parsedOverrideTemperature = 0;
let missingEnvApiKey = '';
let parsedMaxToolTurns = 0;
let parsedFallbackMaxToolTurns = 0;
let parsedAnthropicBaseUrl = '';
let parsedAnthropicVersion = '';
let parsedGeminiBaseUrl = '';
let parsedGrokBaseUrl = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-harness-config-'));
  const configPath = join(tempRootPath, 'inference.json');
  process.env.OPENAI_API_KEY = 'sk-test';
  writeFileSync(configPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    providers: {
      openai: {
        api_key_env: 'OPENAI_API_KEY',
        base_url: 'https://api.openai.com/v1',
      },
    },
    recursion_depth: 3,
    max_tool_turns: 12,
    whitelist: ['*@example.com'],
  }));

  const parsed = readInferenceRuntimeConfig({
    configPath,
  });
  parsedOpenAiApiKey = parsed.providers.openai?.apiKey ?? '';
  parsedOpenAiBaseUrl = parsed.providers.openai?.baseUrl ?? '';
  parsedMaxToolTurns = parsed.maxToolTurns;

  const directConfigPath = join(tempRootPath, 'inference.direct.json');
  writeFileSync(directConfigPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    providers: {
      openai: {
        api_key: 'sk-direct',
      },
    },
    temperature: 0.5,
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));

  const directConfig = readInferenceRuntimeConfig({
    configPath: directConfigPath,
  });
  parsedOverrideModel = directConfig.model;
  parsedOverrideTemperature = directConfig.temperature ?? 0;

  const missingEnvConfigPath = join(tempRootPath, 'inference.missing-env.json');
  writeFileSync(missingEnvConfigPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    providers: {
      openai: {
        api_key_env: 'OPENAI_API_KEY_MISSING',
      },
    },
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));

  const missingEnvConfig = readInferenceRuntimeConfig({
    configPath: missingEnvConfigPath,
  });
  missingEnvApiKey = missingEnvConfig.providers.openai?.apiKey ?? '';

  const invalidTurnsConfigPath = join(tempRootPath, 'inference.invalid-turns.json');
  writeFileSync(invalidTurnsConfigPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    providers: {
      openai: {
        api_key_env: 'OPENAI_API_KEY',
      },
    },
    recursion_depth: 3,
    max_tool_turns: 0,
    whitelist: ['*@example.com'],
  }));
  const invalidTurnsConfig = readInferenceRuntimeConfig({
    configPath: invalidTurnsConfigPath,
  });
  parsedFallbackMaxToolTurns = invalidTurnsConfig.maxToolTurns;

  const anthropicConfigPath = join(tempRootPath, 'inference.anthropic.json');
  process.env.ANTHROPIC_API_KEY = 'anthropic-test';
  writeFileSync(anthropicConfigPath, JSON.stringify({
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-latest',
    providers: {
      anthropic: {
        api_key_env: 'ANTHROPIC_API_KEY',
        base_url: 'https://api.anthropic.com/v1',
        version: '2023-06-01',
      },
    },
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));
  const anthropicConfig = readInferenceRuntimeConfig({
    configPath: anthropicConfigPath,
  });
  parsedAnthropicBaseUrl = anthropicConfig.providers.anthropic?.baseUrl ?? '';
  parsedAnthropicVersion = anthropicConfig.providers.anthropic?.version ?? '';

  const geminiConfigPath = join(tempRootPath, 'inference.gemini.json');
  process.env.GEMINI_API_KEY = 'gemini-test';
  writeFileSync(geminiConfigPath, JSON.stringify({
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    providers: {
      gemini: {
        api_key_env: 'GEMINI_API_KEY',
        base_url: 'https://generativelanguage.googleapis.com/v1beta',
      },
    },
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));
  const geminiConfig = readInferenceRuntimeConfig({
    configPath: geminiConfigPath,
  });
  parsedGeminiBaseUrl = geminiConfig.providers.gemini?.baseUrl ?? '';

  const grokConfigPath = join(tempRootPath, 'inference.grok.json');
  process.env.GROK_API_KEY = 'grok-test';
  writeFileSync(grokConfigPath, JSON.stringify({
    provider: 'grok',
    model: 'grok-3-latest',
    providers: {
      grok: {
        api_key_env: 'GROK_API_KEY',
        base_url: 'https://api.x.ai/v1',
      },
    },
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));
  const grokConfig = readInferenceRuntimeConfig({
    configPath: grokConfigPath,
  });
  parsedGrokBaseUrl = grokConfig.providers.grok?.baseUrl ?? '';
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROK_API_KEY;
});

describe('harness inference config parsing', () => {
  it('resolves provider api key from api_key_env', () => {
    expect(parsedOpenAiApiKey).toBe('sk-test');
  });

  it('parses provider-specific openai base url fields', () => {
    expect(parsedOpenAiBaseUrl).toBe('https://api.openai.com/v1');
  });

  it('retains direct api_key compatibility for existing configs', () => {
    expect(parsedOverrideModel).toBe('gpt-4.1-mini');
  });

  it('parses optional temperature from config file', () => {
    expect(parsedOverrideTemperature).toBe(0.5);
  });

  it('returns undefined api key when api_key_env is unset in process env', () => {
    expect(missingEnvApiKey).toBe('');
  });

  it('parses max_tool_turns from inference config', () => {
    expect(parsedMaxToolTurns).toBe(12);
  });

  it('falls back to default max_tool_turns when configured value is invalid', () => {
    expect(parsedFallbackMaxToolTurns).toBe(8);
  });

  it('parses provider-specific anthropic base url fields', () => {
    expect(parsedAnthropicBaseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('parses provider-specific anthropic version fields', () => {
    expect(parsedAnthropicVersion).toBe('2023-06-01');
  });

  it('parses provider-specific gemini base url fields', () => {
    expect(parsedGeminiBaseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
  });

  it('parses provider-specific grok base url fields', () => {
    expect(parsedGrokBaseUrl).toBe('https://api.x.ai/v1');
  });
});
