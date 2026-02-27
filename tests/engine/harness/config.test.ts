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
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
  delete process.env.OPENAI_API_KEY;
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
});
