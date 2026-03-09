import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
import { createUnifiedLogger } from '@engine/shared/logger';
import { getDefaultPrettyLogTheme } from '@engine/shared/runtime-config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let observerLogText = '';
let failureErrorText = '';
let nonBlockingEmission = false;
let hookDispatchCount = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

/**
 * Returns one deterministic hook module file body that appends observed events.
 */
function buildObserverHookSource(
  args: {
    outputPath: string;
  },
): string {
  return [
    "import { appendFileSync } from 'node:fs';",
    "export async function onEvent(event, payload, config) {",
    "  if (event !== 'harness.inference.started') { return; }",
    "  const line = JSON.stringify({ event, correlationId: payload.correlationId ?? null, marker: config.marker ?? null });",
    `  appendFileSync(${JSON.stringify(args.outputPath)}, line + '\\n', 'utf8');`,
    '}',
    '',
  ].join('\n');
}

/**
 * Returns one failing hook module source used for hook error isolation coverage.
 */
function buildFailingHookSource(): string {
  return [
    "export async function onEvent() {",
    "  throw new Error('hook observer failure');",
    '}',
    '',
  ].join('\n');
}

/**
 * Returns one slow hook module source used for non-blocking dispatch coverage.
 */
function buildSlowHookSource(): string {
  return [
    "export async function onEvent() {",
    "  await new Promise((resolve) => setTimeout(resolve, 90));",
    '}',
    '',
  ].join('\n');
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-hooks-observer-',
  });
  tempRootPath = workspace.tempRootPath;

  const logsDirPath = join(tempRootPath, 'tmp', 'logs');
  const observerPath = join(tempRootPath, 'tmp', 'hook-observer.log');
  workspace.writeFile({
    relativePath: 'extensions/hooks/observer/config.json',
    payload: {
      marker: 'observer-enabled',
    },
  });
  workspace.writeFile({
    relativePath: 'extensions/hooks/observer/index.js',
    payload: buildObserverHookSource({
      outputPath: observerPath,
    }),
  });
  workspace.writeFile({
    relativePath: 'extensions/hooks/failing/index.js',
    payload: buildFailingHookSource(),
  });
  workspace.writeFile({
    relativePath: 'extensions/hooks/slow/index.js',
    payload: buildSlowHookSource(),
  });

  workspace.patchExtensionsManifest({
    hooks: [
      {
        name: 'observer',
        events: ['harness.inference.started'],
      },
      {
        name: 'failing',
        events: ['harness.inference.started'],
      },
      {
        name: 'slow',
        events: ['harness.inference.started'],
      },
    ],
  });

  const hooks = await loadHookRegistry({
    manifestPath: join(tempRootPath, 'extensions', 'extensions.json'),
  });
  const dispatcher = createHookDispatcher({
    hooks,
    onHookError: (
      hookName,
      event,
      error,
    ): void => {
      hookDispatchCount += 1;
      failureErrorText = `${hookName}:${event}:${error.message}`;
    },
  });
  const logger = createUnifiedLogger({
    logsDirPath,
    scope: 'gateway',
    consoleLogFormat: 'pretty',
    prettyLogTheme: getDefaultPrettyLogTheme(),
    emitToConsole: false,
    onEmit: (payload): void => {
      if (payload.event === 'harness.inference.started') {
        hookDispatchCount += 1;
        dispatcher.dispatch(payload.event, payload);
      }
    },
  });

  const startedAtMs = Date.now();
  logger.info({
    event: 'harness.inference.started',
    context: {
      correlationId: 'hooks-e2e-1',
      personaId: 'persona-a',
      threadId: 'thread-a',
      messageId: '<m@x>',
    },
  });
  nonBlockingEmission = Date.now() - startedAtMs < 40;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 180);
  });
  observerLogText = readFileSync(observerPath, 'utf8').trim();
});

afterAll((): void => {
  workspace.cleanup();
});

describe('e2e hooks observer', () => {
  it('dispatches hook callbacks from real runtime logger emissions', () => {
    expect(observerLogText.includes('"event":"harness.inference.started"')).toBe(true);
  });

  it('passes payload context through to observer hook', () => {
    expect(observerLogText.includes('"correlationId":"hooks-e2e-1"')).toBe(true);
  });

  it('deep merges hook default config and passes it into callback', () => {
    expect(observerLogText.includes('"marker":"observer-enabled"')).toBe(true);
  });

  it('isolates failing hooks and still runs observer hook', () => {
    expect(failureErrorText.includes('failing:harness.inference.started:hook observer failure')).toBe(true);
  });

  it('remains non-blocking even with slow hook subscribers', () => {
    expect(nonBlockingEmission).toBe(true);
  });

  it('runs logger emit and hook error callback paths in one emission', () => {
    expect(hookDispatchCount >= 2).toBe(true);
  });
});
