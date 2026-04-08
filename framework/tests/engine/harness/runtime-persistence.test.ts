import { existsSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { persistInboundMessageForRuntime } from '@engine/harness/runtime';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let temporalDbPath = '';
let inboundCount = 0;
let databaseCreated = false;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

const message = createInboundMessage({
  personaId: 'persona-persist',
  messageId: '<persist-1@example.com>',
  threadId: 'thread-persist',
  subject: 'Persist only',
  text: 'Store and ack.',
});

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-harness-runtime-persist-',
  });
  tempRootPath = workspace.tempRootPath;
  workspace.patchPersona({
    personaId: message.personaId as string,
    personaPatch: {
      personaId: message.personaId,
      publicKeyBase32: 'fixture',
      emailLocalPart: 'fixture',
      createdAt: '2026-02-14T00:00:00.000Z',
    },
  });

  persistInboundMessageForRuntime({
    logger: workspace.logger, message });

  temporalDbPath = join(tempRootPath, 'memory', message.personaId as string, 'temporal.db');
  databaseCreated = existsSync(temporalDbPath);
  if (databaseCreated) {
    const db = new Database(temporalDbPath, { readonly: true });
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE direction = 'inbound'",
    ).get() as { count: number };
    inboundCount = row.count;
    db.close();
  }
});

afterAll((): void => {
  workspace.cleanup();
});

describe('harness inbound persistence phase', () => {
  it('creates persona temporal database during inbound persistence', () => {
    expect(databaseCreated).toBe(true);
  });

  it('stores inbound message row before async inference phase', () => {
    expect(inboundCount).toBe(1);
  });
});
