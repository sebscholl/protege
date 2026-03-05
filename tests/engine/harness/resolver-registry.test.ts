import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadResolverRegistry,
  normalizeResolverManifestEntries,
} from '@engine/harness/resolvers/registry';
import { readExtensionManifest } from '@engine/harness/tools/registry';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let parsedResolverEntryCount = -1;
let normalizedResolverNames: string[] = [];
let normalizedResolverConfigValue = '';
let loadedResolverCount = -1;
let loadedResolverName = '';
let loadedResolverResolvedText = '';
let loadedResolverNestedFlag = '';
let invalidResolverEntryError = '';
let invalidResolverConfigError = '';
let invalidResolverEnabledError = '';

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-resolvers-manifest-',
    chdir: false,
  });
  const manifestPath = join(workspace.tempRootPath, 'extensions.json');
  mkdirSync(join(workspace.tempRootPath, 'resolvers', 'sample-resolver'), { recursive: true });

  writeFileSync(
    join(workspace.tempRootPath, 'resolvers', 'sample-resolver', 'index.js'),
    [
      'export const resolver = {',
      "  name: 'sample-resolver',",
      '  resolve: async ({ invocation, config }) => {',
      "    const prefix = typeof config.prefix === 'string' ? config.prefix : 'default';",
      "    const nestedFlag = typeof config.nested?.flag === 'string' ? config.nested.flag : 'missing';",
      '    return `${prefix}:${invocation.type}:${nestedFlag}`;',
      '  },',
      '};',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(workspace.tempRootPath, 'resolvers', 'sample-resolver', 'config.json'),
    JSON.stringify({
      prefix: 'base',
      nested: {
        flag: 'base-nested',
        untouched: true,
      },
    }),
    'utf8',
  );

  writeFileSync(
    manifestPath,
    JSON.stringify({
      tools: [],
      hooks: [],
      resolvers: [
        {
          name: 'sample-resolver',
          config: {
            prefix: 'override',
            nested: {
              flag: 'override-nested',
            },
          },
        },
        'sample-resolver',
        {
          name: 'sample-resolver',
        },
        {
          name: 'sample-resolver',
          enabled: false,
        },
      ],
    }),
    'utf8',
  );

  const manifest = readExtensionManifest({
    manifestPath,
  });
  parsedResolverEntryCount = manifest.resolvers.length;

  const normalized = normalizeResolverManifestEntries({
    resolvers: [
      {
        name: 'sample-resolver',
        config: {
          prefix: 'override',
        },
      },
      'sample-resolver',
    ],
  });
  normalizedResolverNames = normalized.map((entry) => entry.name);
  normalizedResolverConfigValue = String(normalized[0]?.config?.prefix ?? '');

  const loadedResolvers = await loadResolverRegistry({
    manifestPath,
  });
  loadedResolverCount = loadedResolvers.length;
  loadedResolverName = loadedResolvers[0]?.name ?? '';
  loadedResolverResolvedText = String(await loadedResolvers[0]?.resolve({
    invocation: {
      type: 'thread',
      context: {},
    },
    config: loadedResolvers[0]?.config ?? {},
    resolverArgs: [],
  }) ?? '');
  const loadedResolverNestedConfig = loadedResolvers[0]?.config.nested as {
    flag?: string;
  } | undefined;
  loadedResolverNestedFlag = String(loadedResolverNestedConfig?.flag ?? '');

  try {
    normalizeResolverManifestEntries({
      resolvers: [
        42 as unknown as string,
      ],
    });
  } catch (error) {
    invalidResolverEntryError = (error as Error).message;
  }

  try {
    normalizeResolverManifestEntries({
      resolvers: [
        {
          name: 'broken-config',
          config: 'invalid' as unknown as Record<string, unknown>,
        },
      ],
    });
  } catch (error) {
    invalidResolverConfigError = (error as Error).message;
  }

  try {
    normalizeResolverManifestEntries({
      resolvers: [
        {
          name: 'invalid-enabled',
          enabled: 'yes' as unknown as boolean,
        },
      ],
    });
  } catch (error) {
    invalidResolverEnabledError = (error as Error).message;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('harness resolver registry', () => {
  it('reads resolver entries from extensions manifest', () => {
    expect(parsedResolverEntryCount).toBe(4);
  });

  it('normalizes unique resolver names preserving order', () => {
    expect(normalizedResolverNames).toEqual(['sample-resolver']);
  });

  it('preserves resolver config overrides for downstream merge', () => {
    expect(normalizedResolverConfigValue).toBe('override');
  });

  it('loads resolver modules from extension directories', () => {
    expect(loadedResolverCount).toBe(1);
  });

  it('returns loaded resolver name from module contract', () => {
    expect(loadedResolverName).toBe('sample-resolver');
  });

  it('executes loaded resolver with merged config', () => {
    expect(loadedResolverResolvedText).toBe('override:thread:override-nested');
  });

  it('deep-merges resolver default config with manifest override config', () => {
    expect(loadedResolverNestedFlag).toBe('override-nested');
  });

  it('fails clearly for invalid resolver entry shape', () => {
    expect(invalidResolverEntryError.includes('expected string or object')).toBe(true);
  });

  it('fails clearly for invalid resolver config shape', () => {
    expect(invalidResolverConfigError.includes('"config" must be an object')).toBe(true);
  });

  it('fails clearly for invalid resolver enabled shape', () => {
    expect(invalidResolverEnabledError.includes('"enabled" must be boolean')).toBe(true);
  });
});
