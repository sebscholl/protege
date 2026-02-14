import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUnifiedLogger } from '@engine/shared/logger';

let tempRootPath = '';
let consoleLine = '';
let fileLine = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-unified-logger-'));

  const originalWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  const logger = createUnifiedLogger({
    logsDirPath: tempRootPath,
    scope: 'gateway',
    consoleLogFormat: 'pretty',
  });
  logger.info({
    event: 'gateway.inbound.received',
    context: {
      personaId: 'persona-a',
      messageId: '<msg@x>',
    },
  });
  process.stdout.write = originalWrite;

  consoleLine = captured.trim();
  fileLine = readFileSync(join(tempRootPath, 'protege.log'), 'utf8').trim();
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('unified logger formatting', () => {
  it('emits human-readable pretty console lines when enabled', () => {
    expect(consoleLine.includes('INFO gateway.gateway.inbound.received')).toBe(true);
  });

  it('always writes json lines to the shared log file', () => {
    expect(fileLine.startsWith('{')).toBe(true);
  });
});
