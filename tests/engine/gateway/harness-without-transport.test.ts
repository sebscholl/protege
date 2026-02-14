import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundForRuntime } from '@engine/gateway/index';
import { mswIntercept } from '@tests/network/index';

let tempRootPath = '';
let previousCwd = '';
let temporalDbPath = '';
let outboundCount = 0;
let databaseCreated = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-no-transport-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  writeFileSync(join(tempRootPath, 'config', 'inference.json'), JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    recursion_depth: 3,
    whitelist: ['*@example.com'],
    providers: {
      openai: {
        api_key: 'test-key',
      },
    },
  }));
  writeFileSync(join(tempRootPath, 'config', 'system-prompt.md'), 'You are Protege.');
  mswIntercept({ fixtureKey: 'openai/chat-completions/200' });

  await handleInboundForRuntime({
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    message: {
      personaId: 'persona-test',
      messageId: '<inbound-1@example.com>',
      threadId: 'thread-no-transport',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'agent@example.com' }],
      subject: 'No transport harness run',
      text: 'Please respond.',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    transport: undefined,
    defaultFromAddress: 'protege@localhost',
  });

  temporalDbPath = join(tempRootPath, 'memory', 'persona-test', 'temporal.db');
  databaseCreated = existsSync(temporalDbPath);
  if (databaseCreated) {
    const db = new Database(temporalDbPath, { readonly: true });
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'",
    ).get() as { count: number };
    outboundCount = row.count;
    db.close();
  }
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway harness execution without outbound transport', () => {
  it('creates persona temporal db even when transport is not configured', () => {
    expect(databaseCreated).toBe(true);
  });

  it('persists outbound harness message even when smtp send is skipped', () => {
    expect(outboundCount).toBe(1);
  });
});
