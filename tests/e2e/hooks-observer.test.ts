import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
import { createUnifiedLogger } from '@engine/shared/logger';
import { getDefaultPrettyLogTheme } from '@engine/shared/runtime-config';

let tempRootPath = '';
let previousCwd = '';
let observerLogText = '';
let failureErrorText = '';
let nonBlockingEmission = false;
let hookDispatchCount = 0;

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

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-e2e-hooks-observer-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  const extensionsDirPath = join(tempRootPath, 'extensions');
  const hooksDirPath = join(extensionsDirPath, 'hooks');
  const logsDirPath = join(tempRootPath, 'tmp', 'logs');
  const observerPath = join(tempRootPath, 'tmp', 'hook-observer.log');
  mkdirSync(hooksDirPath, { recursive: true });
  mkdirSync(logsDirPath, { recursive: true });

  const observerHookDirPath = join(hooksDirPath, 'observer');
  mkdirSync(observerHookDirPath, { recursive: true });
  writeFileSync(join(observerHookDirPath, 'config.json'), JSON.stringify({
    marker: 'observer-enabled',
  }), 'utf8');
  writeFileSync(join(observerHookDirPath, 'index.js'), buildObserverHookSource({
    outputPath: observerPath,
  }), 'utf8');

  const failingHookDirPath = join(hooksDirPath, 'failing');
  mkdirSync(failingHookDirPath, { recursive: true });
  writeFileSync(join(failingHookDirPath, 'index.js'), [
    "export async function onEvent() {",
    "  throw new Error('hook observer failure');",
    '}',
    '',
  ].join('\n'), 'utf8');

  const slowHookDirPath = join(hooksDirPath, 'slow');
  mkdirSync(slowHookDirPath, { recursive: true });
  writeFileSync(join(slowHookDirPath, 'index.js'), [
    "export async function onEvent() {",
    "  await new Promise((resolve) => setTimeout(resolve, 90));",
    '}',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(join(extensionsDirPath, 'extensions.json'), JSON.stringify({
    tools: [],
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
  }), 'utf8');

  const hooks = await loadHookRegistry({
    manifestPath: join(extensionsDirPath, 'extensions.json'),
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
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
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

