import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readInferenceRuntimeConfig } from '@engine/harness/config';

let tempRootPath = '';
let parsedOpenAiApiKey = '';
let parsedOpenAiBaseUrl = '';
let parsedOverrideOpenAiApiKey = '';
let parsedOverrideModel = '';
let parsedOverrideTemperature = 0;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-harness-config-'));
  const configPath = join(tempRootPath, 'inference.json');
  writeFileSync(configPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    providers: {
      openai: {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
      },
    },
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));

  const parsed = readInferenceRuntimeConfig({ configPath });
  parsedOpenAiApiKey = parsed.providers.openai?.apiKey ?? '';
  parsedOpenAiBaseUrl = parsed.providers.openai?.baseUrl ?? '';

  const baseConfigPath = join(tempRootPath, 'inference.base.json');
  const localConfigPath = join(tempRootPath, 'inference.local.json');
  writeFileSync(baseConfigPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    providers: {
      openai: {
        api_key: 'sk-base',
      },
    },
    temperature: 0.1,
    recursion_depth: 3,
    whitelist: ['*@example.com'],
  }));
  writeFileSync(localConfigPath, JSON.stringify({
    model: 'gpt-4.1-mini',
    providers: {
      openai: {
        api_key: 'sk-local',
      },
    },
    temperature: 0.5,
  }));

  const overridden = readInferenceRuntimeConfig({
    configPath: baseConfigPath,
    localConfigPath,
  });
  parsedOverrideOpenAiApiKey = overridden.providers.openai?.apiKey ?? '';
  parsedOverrideModel = overridden.model;
  parsedOverrideTemperature = overridden.temperature ?? 0;
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness inference config parsing', () => {
  it('parses provider-specific openai api key fields', () => {
    expect(parsedOpenAiApiKey).toBe('sk-test');
  });

  it('parses provider-specific openai base url fields', () => {
    expect(parsedOpenAiBaseUrl).toBe('https://api.openai.com/v1');
  });

  it('overrides provider api keys from inference.local.json', () => {
    expect(parsedOverrideOpenAiApiKey).toBe('sk-local');
  });

  it('overrides model from inference.local.json', () => {
    expect(parsedOverrideModel).toBe('gpt-4.1-mini');
  });

  it('overrides temperature from inference.local.json', () => {
    expect(parsedOverrideTemperature).toBe(0.5);
  });
});
