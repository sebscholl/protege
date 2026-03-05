import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  normalizeEnabledHookEntries,
  readExtensionManifest,
} from '@engine/harness/tools/registry';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let parsedHookEntryCount = -1;
let normalizedHookNames: string[] = [];
let normalizedHookEvents: string[][] = [];
let normalizedSecondHookConfigChannel = '';
let invalidHookEntryError = '';
let invalidHookEventsError = '';
let invalidHookConfigError = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-hooks-manifest-',
    chdir: false,
  });
  const manifestPath = join(workspace.tempRootPath, 'extensions.json');
  writeFileSync(manifestPath, JSON.stringify({
    tools: [],
    hooks: [
      'audit-log',
      {
        name: 'slack-notify',
        events: ['harness.inference.started', 'harness.inference.completed', 'harness.inference.started'],
        config: {
          channel: '#ops',
        },
      },
      {
        name: 'blank-events-fallback',
        events: ['   '],
      },
      'audit-log',
    ],
  }), 'utf8');
  const manifest = readExtensionManifest({
    manifestPath,
  });
  parsedHookEntryCount = manifest.hooks.length;

  const normalized = normalizeEnabledHookEntries({
    hooks: manifest.hooks,
  });
  normalizedHookNames = normalized.map((entry) => entry.name);
  normalizedHookEvents = normalized.map((entry) => entry.events);
  normalizedSecondHookConfigChannel = String(normalized[1]?.config?.channel ?? '');

  try {
    normalizeEnabledHookEntries({
      hooks: [
        42 as unknown as string,
      ],
    });
  } catch (error) {
    invalidHookEntryError = (error as Error).message;
  }

  try {
    normalizeEnabledHookEntries({
      hooks: [
        {
          name: 'broken-events',
          events: ['ok', 7 as unknown as string],
        },
      ],
    });
  } catch (error) {
    invalidHookEventsError = (error as Error).message;
  }

  try {
    normalizeEnabledHookEntries({
      hooks: [
        {
          name: 'broken-config',
          config: 'invalid' as unknown as Record<string, unknown>,
        },
      ],
    });
  } catch (error) {
    invalidHookConfigError = (error as Error).message;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('harness hooks manifest normalization', () => {
  it('reads hook entries from extensions manifest', () => {
    expect(parsedHookEntryCount).toBe(4);
  });

  it('normalizes unique hooks preserving manifest order', () => {
    expect(normalizedHookNames).toEqual(['audit-log', 'slack-notify', 'blank-events-fallback']);
  });

  it('normalizes duplicate hook event names', () => {
    expect(normalizedHookEvents[1]).toEqual(['harness.inference.started', 'harness.inference.completed']);
  });

  it('falls back to wildcard events when normalized events are empty', () => {
    expect(normalizedHookEvents[2]).toEqual(['*']);
  });

  it('preserves hook config objects for downstream deep merge', () => {
    expect(normalizedSecondHookConfigChannel).toBe('#ops');
  });

  it('fails clearly for invalid hook entry shape', () => {
    expect(invalidHookEntryError.includes('expected string or object')).toBe(true);
  });

  it('fails clearly for invalid hook events shape', () => {
    expect(invalidHookEventsError.includes('"events" must be a string array')).toBe(true);
  });

  it('fails clearly for invalid hook config shape', () => {
    expect(invalidHookConfigError.includes('"config" must be an object')).toBe(true);
  });
});
