import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundForRuntime } from '@engine/gateway/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { mswIntercept } from '@tests/network/index';

let tempRootPath = '';
let previousCwd = '';
let temporalDbPath = '';
let outboundCount = 0;
let databaseCreated = false;
let cleanupWorkspace = (): void => undefined;

beforeAll(async (): Promise<void> => {
  const workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-no-transport-',
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;
  cleanupWorkspace = workspace.cleanup;
  process.env.OPENAI_API_KEY = 'test-key';

  mkdirSync(join(tempRootPath, 'extensions', 'providers', 'openai'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', 'persona-test'), { recursive: true });
  writeFileSync(join(tempRootPath, 'personas', 'persona-test', 'persona.json'), JSON.stringify({
    personaId: 'persona-test',
    publicKeyBase32: 'fixture',
    emailLocalPart: 'fixture',
    emailAddress: 'fixture@localhost',
    createdAt: '2026-02-14T00:00:00.000Z',
  }));
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['current-input'],
      responsibility: ['current-input'],
    },
  });
  writeFileSync(join(tempRootPath, 'extensions', 'providers', 'openai', 'config.json'), JSON.stringify({
    api_key_env: 'OPENAI_API_KEY',
    base_url: 'https://api.openai.com/v1',
  }));
  writeFileSync(join(tempRootPath, 'extensions', 'extensions.json'), JSON.stringify({
    tools: [],
    hooks: [],
    providers: ['openai'],
    resolvers: ['current-input'],
  }));
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
    mailDomain: 'localhost',
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
  cleanupWorkspace();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
});

describe('gateway harness execution without outbound transport', () => {
  it('creates persona temporal db even when transport is not configured', () => {
    expect(databaseCreated).toBe(true);
  });

  it('persists outbound harness message even when smtp send is skipped', () => {
    expect(outboundCount).toBe(1);
  });
});
