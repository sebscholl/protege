import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHookDispatcher, isHookSubscribedToEvent, loadHookRegistry } from '@engine/harness/hooks/registry';

let tempRootPath = '';
let loadedHookNames: string[] = [];
let loadedHookEvents: string[][] = [];
let loadedHookConfigMode = '';
let loadedHookConfigBatch = -1;
let matchedAuditSubscription = false;
let matchedWildcardSubscription = false;
let dispatchedLogContent = '';
let brokenHookErrorMessage = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-hook-registry-'));
  const hooksDirPath = join(tempRootPath, 'extensions', 'hooks');
  mkdirSync(hooksDirPath, { recursive: true });
  const manifestPath = join(tempRootPath, 'extensions', 'extensions.json');
  const eventLogPath = join(tempRootPath, 'events.log');

  const auditHookDirPath = join(hooksDirPath, 'audit-file');
  mkdirSync(auditHookDirPath, { recursive: true });
  writeFileSync(join(auditHookDirPath, 'config.json'), JSON.stringify({
    output: {
      mode: 'compact',
      batch: 1,
    },
  }), 'utf8');
  writeFileSync(join(auditHookDirPath, 'index.js'), [
    "import { appendFileSync } from 'node:fs';",
    "export async function onEvent(event, payload, config) {",
    `  appendFileSync(${JSON.stringify(eventLogPath)}, JSON.stringify({ hook: 'audit-file', event, payload, config }) + '\\n', 'utf8');`,
    '}',
    '',
  ].join('\n'), 'utf8');

  const wildcardHookDirPath = join(hooksDirPath, 'wildcard-hook');
  mkdirSync(wildcardHookDirPath, { recursive: true });
  writeFileSync(join(wildcardHookDirPath, 'index.js'), [
    "export async function onEvent() {",
    '  return;',
    '}',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(manifestPath, JSON.stringify({
    tools: [],
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
  }), 'utf8');

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

  const brokenHookDirPath = join(hooksDirPath, 'broken-hook');
  mkdirSync(brokenHookDirPath, { recursive: true });
  writeFileSync(join(brokenHookDirPath, 'index.js'), 'export const value = 1;\n', 'utf8');
  writeFileSync(manifestPath, JSON.stringify({
    tools: [],
    hooks: ['broken-hook'],
  }), 'utf8');
  try {
    await loadHookRegistry({
      manifestPath,
    });
  } catch (error) {
    brokenHookErrorMessage = (error as Error).message;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
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
