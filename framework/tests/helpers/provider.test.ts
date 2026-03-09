import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let envValueBeforeRestore = '';
let envValueAfterRestore = '';
let manifestProviderName = '';
let providerConfigApiEnv = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-provider-helper-',
  });

  const scaffold = scaffoldProviderConfig({
    workspace,
    providerName: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKeyValue: 'test-key',
    providerConfig: {
      base_url: 'https://api.openai.com/v1',
    },
  });

  envValueBeforeRestore = process.env.OPENAI_API_KEY ?? '';
  const manifest = JSON.parse(
    readFileSync(join(workspace.tempRootPath, 'extensions', 'extensions.json'), 'utf8'),
  ) as {
    providers?: Array<{
      name?: string;
    }>;
  };
  const providerConfig = JSON.parse(
    readFileSync(join(workspace.tempRootPath, 'extensions', 'providers', 'openai', 'config.json'), 'utf8'),
  ) as {
    api_key_env?: string;
  };
  manifestProviderName = manifest.providers?.[0]?.name ?? '';
  providerConfigApiEnv = providerConfig.api_key_env ?? '';

  scaffold.restoreEnv();
  envValueAfterRestore = process.env.OPENAI_API_KEY ?? '';
});

afterAll((): void => {
  workspace.cleanup();
});

describe('provider helper', () => {
  it('sets provider api key env during scaffold', () => {
    expect(envValueBeforeRestore).toBe('test-key');
  });

  it('writes provider name into extensions manifest provider list', () => {
    expect(manifestProviderName).toBe('openai');
  });

  it('writes api_key_env into provider config file', () => {
    expect(providerConfigApiEnv).toBe('OPENAI_API_KEY');
  });

  it('restores provider api key env after cleanup callback', () => {
    expect(envValueAfterRestore).toBe('');
  });
});
