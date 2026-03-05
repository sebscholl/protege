import { existsSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundForRuntime } from '@engine/gateway/index';
import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { mswIntercept } from '@tests/network/index';

let tempRootPath = '';
let temporalDbPath = '';
let outboundCount = 0;
let databaseCreated = false;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let providerScaffold!: ReturnType<typeof scaffoldProviderConfig>;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-gateway-no-transport-',
  });
  tempRootPath = workspace.tempRootPath;
  providerScaffold = scaffoldProviderConfig({
    workspace,
    providerName: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKeyValue: 'test-key',
    providerConfig: {
      base_url: 'https://api.openai.com/v1',
    },
  });

  workspace.patchPersona({
    personaId: 'persona-test',
    personaPatch: {
      personaId: 'persona-test',
      publicKeyBase32: 'fixture',
      emailLocalPart: 'fixture',
      emailAddress: 'fixture@localhost',
      createdAt: '2026-02-14T00:00:00.000Z',
    },
  });
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['current-input'],
      responsibility: ['current-input'],
    },
  });
  workspace.patchExtensionsManifest({
    tools: [],
    hooks: [],
    resolvers: ['current-input'],
  });
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
  providerScaffold.restoreEnv();
  workspace.cleanup();
});

describe('gateway harness execution without outbound transport', () => {
  it('creates persona temporal db even when transport is not configured', () => {
    expect(databaseCreated).toBe(true);
  });

  it('persists outbound harness message even when smtp send is skipped', () => {
    expect(outboundCount).toBe(1);
  });
});
