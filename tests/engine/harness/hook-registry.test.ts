import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHookDispatcher, isHookSubscribedToEvent, loadHookRegistry } from '@engine/harness/hooks/registry';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let loadedHookNames: string[] = [];
let loadedHookEvents: string[][] = [];
let loadedHookConfigMode = '';
let loadedHookConfigBatch = -1;
let matchedAuditSubscription = false;
let matchedWildcardSubscription = false;
let dispatchedLogContent = '';
let brokenHookErrorMessage = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

/**
 * Builds one hook module source that appends event payloads to the event log file.
 */
function buildAuditHookSource(
  args: {
    eventLogPath: string;
  },
): string {
  return [
    "import { appendFileSync } from 'node:fs';",
    "export async function onEvent(event, payload, config) {",
    `  appendFileSync(${JSON.stringify(args.eventLogPath)}, JSON.stringify({ hook: 'audit-file', event, payload, config }) + '\\n', 'utf8');`,
    '}',
    '',
  ].join('\n');
}

/**
 * Builds one no-op hook module source for wildcard subscription coverage.
 */
function buildWildcardHookSource(): string {
  return [
    "export async function onEvent() {",
    '  return;',
    '}',
    '',
  ].join('\n');
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-hook-registry-',
  });
  tempRootPath = workspace.tempRootPath;
  const manifestPath = join(tempRootPath, 'extensions', 'extensions.json');
  const eventLogPath = join(tempRootPath, 'events.log');

  workspace.writeFile({
    relativePath: 'extensions/hooks/audit-file/config.json',
    payload: {
      output: {
        mode: 'compact',
        batch: 1,
      },
    },
  });
  workspace.writeFile({
    relativePath: 'extensions/hooks/audit-file/index.js',
    payload: buildAuditHookSource({
      eventLogPath,
    }),
  });
  workspace.writeFile({
    relativePath: 'extensions/hooks/wildcard-hook/index.js',
    payload: buildWildcardHookSource(),
  });
  workspace.patchExtensionsManifest({
    hooks: [
      {
        name: 'audit-file',
        events: ['harness.inference.completed'],
        config: {
          output: {
            batch: 9,
          },
        },
      },
      'wildcard-hook',
    ],
  });

  const hooks = await loadHookRegistry({
    manifestPath,
  });
  loadedHookNames = hooks.map((hook) => hook.name);
  loadedHookEvents = hooks.map((hook) => hook.events);
  loadedHookConfigMode = String(hooks[0]?.config.output && (hooks[0].config.output as Record<string, unknown>).mode);
  loadedHookConfigBatch = Number(hooks[0]?.config.output && (hooks[0].config.output as Record<string, unknown>).batch);
  matchedAuditSubscription = isHookSubscribedToEvent({
    hook: hooks[0],
    event: 'harness.inference.completed',
  });
  matchedWildcardSubscription = isHookSubscribedToEvent({
    hook: hooks[1],
    event: 'gateway.inbound.parsed',
  });

  const dispatcher = createHookDispatcher({
    hooks,
  });
  dispatcher.dispatch('harness.inference.completed', {
    level: 'info',
    scope: 'harness',
    event: 'harness.inference.completed',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-1',
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  dispatchedLogContent = readFileSync(eventLogPath, 'utf8').trim();

  workspace.writeFile({
    relativePath: 'extensions/hooks/broken-hook/index.js',
    payload: 'export const value = 1;\n',
  });
  workspace.patchExtensionsManifest({
    hooks: ['broken-hook'],
  });
  try {
    await loadHookRegistry({
      manifestPath,
    });
  } catch (error) {
    brokenHookErrorMessage = (error as Error).message;
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('harness hook registry', () => {
  it('loads hooks in manifest order', () => {
    expect(loadedHookNames).toEqual(['audit-file', 'wildcard-hook']);
  });

  it('preserves normalized hook event subscriptions', () => {
    expect(loadedHookEvents).toEqual([['harness.inference.completed'], ['*']]);
  });

  it('deep merges hook default config with manifest override', () => {
    expect(loadedHookConfigMode === 'compact' && loadedHookConfigBatch === 9).toBe(true);
  });

  it('matches exact-event hook subscriptions', () => {
    expect(matchedAuditSubscription).toBe(true);
  });

  it('matches wildcard hook subscriptions', () => {
    expect(matchedWildcardSubscription).toBe(true);
  });

  it('dispatches subscribed hook callbacks asynchronously', () => {
    expect(dispatchedLogContent.includes('"event":"harness.inference.completed"')).toBe(true);
  });

  it('fails clearly when hook module does not export onEvent', () => {
    expect(brokenHookErrorMessage.includes('must export onEvent')).toBe(true);
  });
});
