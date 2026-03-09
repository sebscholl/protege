import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUnifiedLogger } from '@engine/shared/logger';
import { getDefaultPrettyLogTheme } from '@engine/shared/runtime-config';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let consoleLine = '';
let fileLine = '';
let silentConsoleOutput = '';
let silentFileLine = '';
let prettyConsoleHasMultilineContext = false;
let prettyConsoleHasAnsiStyle = false;
let emittedEvent = '';
let emittedCorrelationId = '';

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-unified-logger-',
    chdir: false,
  });

  const originalWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  const logger = createUnifiedLogger({
    logsDirPath: workspace.tempRootPath,
    scope: 'gateway',
    consoleLogFormat: 'pretty',
    prettyLogTheme: getDefaultPrettyLogTheme(),
    onEmit: (
      payload: Record<string, unknown>,
    ): void => {
      emittedEvent = String(payload.event ?? '');
      emittedCorrelationId = String(payload.correlationId ?? '');
    },
  });
  logger.info({
    event: 'gateway.inbound.received',
    context: {
      personaId: 'persona-a',
      messageId: '<msg@x>',
      correlationId: 'corr-1',
    },
  });
  process.stdout.write = originalWrite;

  consoleLine = captured.trim();
  prettyConsoleHasMultilineContext = consoleLine.includes('\n\t');
  prettyConsoleHasAnsiStyle = consoleLine.includes('\u001b[');
  fileLine = readFileSync(join(workspace.tempRootPath, 'protege.log'), 'utf8').trim();

  const originalSilentWrite = process.stdout.write.bind(process.stdout);
  let silentCaptured = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    silentCaptured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  const silentLogger = createUnifiedLogger({
    logsDirPath: workspace.tempRootPath,
    scope: 'chat',
    consoleLogFormat: 'pretty',
    emitToConsole: false,
  });
  silentLogger.info({
    event: 'chat.harness.inference.started',
    context: {
      threadId: 'thread-1',
    },
  });
  process.stdout.write = originalSilentWrite;
  silentConsoleOutput = silentCaptured.trim();
  const lines = readFileSync(join(workspace.tempRootPath, 'protege.log'), 'utf8').trim().split('\n');
  silentFileLine = lines[lines.length - 1] ?? '';
});

afterAll((): void => {
  workspace.cleanup();
});

describe('unified logger formatting', () => {
  it('emits human-readable pretty console lines when enabled', () => {
    expect(consoleLine.includes('INFO')).toBe(true);
  });

  it('formats pretty console context as indented multi-line key-value rows', () => {
    expect(prettyConsoleHasMultilineContext).toBe(true);
  });

  it('applies ansi color/style sequences in pretty console mode when theme is enabled', () => {
    expect(prettyConsoleHasAnsiStyle).toBe(true);
  });

  it('always writes json lines to the shared log file', () => {
    expect(fileLine.startsWith('{')).toBe(true);
  });

  it('supports suppressing console emission while preserving file logging', () => {
    expect(silentConsoleOutput.length === 0 && silentFileLine.includes('"scope":"chat"')).toBe(true);
  });

  it('emits structured payload callbacks for adjacent runtime subscribers', () => {
    expect(emittedEvent === 'gateway.inbound.received' && emittedCorrelationId === 'corr-1').toBe(true);
  });
});
