import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readInferenceRuntimeConfig } from '@engine/harness/config';

let tempRootPath = '';
let parsedOpenAiApiKey = '';
let parsedOpenAiBaseUrl = '';

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
});
