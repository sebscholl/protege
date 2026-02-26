import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadToolRegistry,
  normalizeEnabledToolEntries,
} from '@engine/harness/tool-registry';

let toolNames: string[] = [];
let missingManifestToolCount = -1;
let tempRootPath = '';
let overriddenWebSearchProvider = '';
let invalidManifestError = '';

beforeAll(async (): Promise<void> => {
  const registry = await loadToolRegistry();
  toolNames = Object.keys(registry).sort();

  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-tool-registry-'));
  const missingManifestRegistry = await loadToolRegistry({
    manifestPath: join(tempRootPath, 'extensions.json'),
  });
  missingManifestToolCount = Object.keys(missingManifestRegistry).length;

  process.env.TAVILY_API_KEY = 'registry-test-key';
  const overrideManifestPath = join(tempRootPath, 'extensions.override.json');
  writeFileSync(overrideManifestPath, JSON.stringify({
    tools: [
      {
        name: 'web-search',
        config: {
          provider: 'tavily',
        },
      },
    ],
    hooks: [],
  }), 'utf8');
  const overrideRegistry = await loadToolRegistry({
    manifestPath: overrideManifestPath,
  });
  await overrideRegistry.web_search.execute({
    input: {
      query: 'hello',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          if (args.action === 'web.search') {
            overriddenWebSearchProvider = String(args.payload.provider ?? '');
          }
          return {};
        },
      },
    },
  });

  try {
    normalizeEnabledToolEntries({
      tools: [
        {
          name: 'web-search',
          config: 'invalid',
        } as unknown as {
          name: string;
          config: Record<string, unknown>;
        },
      ],
    });
  } catch (error) {
    invalidManifestError = (error as Error).message;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
  delete process.env.TAVILY_API_KEY;
});

describe('harness tool registry', () => {
  it('loads shell from extensions manifest', () => {
    expect(toolNames.includes('shell')).toBe(true);
  });

  it('loads glob from extensions manifest', () => {
    expect(toolNames.includes('glob')).toBe(true);
  });

  it('loads search from extensions manifest', () => {
    expect(toolNames.includes('search')).toBe(true);
  });

  it('loads read_file from extensions manifest', () => {
    expect(toolNames.includes('read_file')).toBe(true);
  });

  it('loads write_file from extensions manifest', () => {
    expect(toolNames.includes('write_file')).toBe(true);
  });

  it('loads edit_file from extensions manifest', () => {
    expect(toolNames.includes('edit_file')).toBe(true);
  });

  it('loads enabled tools from extensions manifest', () => {
    expect(toolNames.includes('send_email')).toBe(true);
  });

  it('loads web_fetch from extensions manifest', () => {
    expect(toolNames.includes('web_fetch')).toBe(true);
  });

  it('loads web_search from extensions manifest', () => {
    expect(toolNames.includes('web_search')).toBe(true);
  });

  it('returns an empty registry when the extensions manifest is missing', () => {
    expect(missingManifestToolCount).toBe(0);
  });

  it('applies object-entry config overrides for web_search tool', () => {
    expect(overriddenWebSearchProvider).toBe('tavily');
  });

  it('fails clearly for invalid manifest object entry shape', () => {
    expect(invalidManifestError.includes('"config" must be an object')).toBe(true);
  });
});
