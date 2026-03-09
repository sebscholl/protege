import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveSelectedProviderRuntimeConfig } from '@engine/harness/providers/registry';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let resolvedOpenAiApiKey = '';
let resolvedOpenAiBaseUrl = '';
let resolvedDefaultEnvName = '';
let missingProviderErrorMessage = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-provider-registry-',
    chdir: false,
  });
  process.env.OPENAI_API_KEY = 'manifest-openai-key';

  writeFileSync(
    join(workspace.tempRootPath, 'extensions.json'),
    JSON.stringify({
      providers: [
        {
          name: 'openai',
          config: {
            api_key_env: 'OPENAI_API_KEY',
            base_url: 'https://custom.openai.local/v1',
          },
        },
      ],
      tools: [],
      hooks: [],
      resolvers: [],
    }),
  );

  const resolvedOpenAi = resolveSelectedProviderRuntimeConfig({
    provider: 'openai',
    manifestPath: join(workspace.tempRootPath, 'extensions.json'),
  });
  resolvedOpenAiApiKey = resolvedOpenAi.apiKey ?? '';
  resolvedOpenAiBaseUrl = resolvedOpenAi.baseUrl ?? '';

  writeFileSync(
    join(workspace.tempRootPath, 'extensions-empty.json'),
    JSON.stringify({
      tools: [],
      hooks: [],
      resolvers: [],
    }),
  );

  const resolvedFromDefaults = resolveSelectedProviderRuntimeConfig({
    provider: 'anthropic',
    manifestPath: join(workspace.tempRootPath, 'extensions-empty.json'),
  });
  resolvedDefaultEnvName = resolvedFromDefaults.apiKeyEnv ?? '';

  try {
    resolveSelectedProviderRuntimeConfig({
      provider: 'grok',
      manifestPath: join(workspace.tempRootPath, 'extensions.json'),
    });
  } catch (error) {
    missingProviderErrorMessage = (error as Error).message;
  }
});

afterAll((): void => {
  workspace.cleanup();
  delete process.env.OPENAI_API_KEY;
});

describe('provider runtime config resolver', () => {
  it('resolves selected provider api key from manifest api_key_env', () => {
    expect(resolvedOpenAiApiKey).toBe('manifest-openai-key');
  });

  it('resolves selected provider base url from manifest config', () => {
    expect(resolvedOpenAiBaseUrl).toBe('https://custom.openai.local/v1');
  });

  it('fails when selected provider is not enabled in manifest providers', () => {
    expect(missingProviderErrorMessage.includes('is not enabled in extensions/extensions.json providers[]')).toBe(true);
  });

  it('falls back to default provider env mapping when manifest has no providers section', () => {
    expect(resolvedDefaultEnvName).toBe('ANTHROPIC_API_KEY');
  });
});
