import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { mswIntercept } from '@tests/network/index';

let tempRootPath = '';
let previousCwd = '';
let personaADatabasePath = '';
let personaBDatabasePath = '';
let personaAMessageCount = 0;
let personaBMessageCount = 0;
let personaAHasForeignThread = false;
let personaBHasForeignThread = false;

const personaAMessage: InboundNormalizedMessage = {
  personaId: 'persona-a',
  messageId: '<persona-a-inbound@example.com>',
  threadId: 'thread-a',
  from: [{ address: 'sender-a@example.com' }],
  to: [{ address: 'persona-a@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'persona-a@example.com' }],
  subject: 'Persona A',
  text: 'Run for persona A.',
  references: [],
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/persona-a.eml',
  attachments: [],
};

const personaBMessage: InboundNormalizedMessage = {
  personaId: 'persona-b',
  messageId: '<persona-b-inbound@example.com>',
  threadId: 'thread-b',
  from: [{ address: 'sender-b@example.com' }],
  to: [{ address: 'persona-b@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'persona-b@example.com' }],
  subject: 'Persona B',
  text: 'Run for persona B.',
  references: [],
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/persona-b.eml',
  attachments: [],
};

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-persona-isolation-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });
  mkdirSync(join(tempRootPath, 'extensions'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', 'persona-a'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', 'persona-b'), { recursive: true });

  writeFileSync(join(tempRootPath, 'personas', 'persona-a', 'persona.json'), JSON.stringify({
    personaId: 'persona-a',
    publicKeyBase32: 'fixture-a',
    emailLocalPart: 'fixture-a',
    createdAt: '2026-02-14T00:00:00.000Z',
  }));
  writeFileSync(join(tempRootPath, 'personas', 'persona-b', 'persona.json'), JSON.stringify({
    personaId: 'persona-b',
    publicKeyBase32: 'fixture-b',
    emailLocalPart: 'fixture-b',
    createdAt: '2026-02-14T00:00:00.000Z',
  }));
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
  writeFileSync(join(tempRootPath, 'extensions', 'extensions.json'), JSON.stringify({
    tools: [],
    hooks: [],
  }));

  mswIntercept({ fixtureKey: 'openai/chat-completions/200' });

  persistInboundMessageForRuntime({ message: personaAMessage });
  persistInboundMessageForRuntime({ message: personaBMessage });

  await Promise.all([
    runHarnessForPersistedInboundMessage({
      message: personaAMessage,
      senderAddress: 'protege@localhost',
    }),
    runHarnessForPersistedInboundMessage({
      message: personaBMessage,
      senderAddress: 'protege@localhost',
    }),
  ]);

  personaADatabasePath = join(tempRootPath, 'memory', 'persona-a', 'temporal.db');
  personaBDatabasePath = join(tempRootPath, 'memory', 'persona-b', 'temporal.db');

  if (existsSync(personaADatabasePath)) {
    const db = new Database(personaADatabasePath, { readonly: true });
    const countRow = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    personaAMessageCount = countRow.count;
    const foreignRow = db.prepare("SELECT COUNT(*) as count FROM messages WHERE thread_id = 'thread-b'").get() as { count: number };
    personaAHasForeignThread = foreignRow.count > 0;
    db.close();
  }

  if (existsSync(personaBDatabasePath)) {
    const db = new Database(personaBDatabasePath, { readonly: true });
    const countRow = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    personaBMessageCount = countRow.count;
    const foreignRow = db.prepare("SELECT COUNT(*) as count FROM messages WHERE thread_id = 'thread-a'").get() as { count: number };
    personaBHasForeignThread = foreignRow.count > 0;
    db.close();
  }
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness runtime persona isolation under concurrent runs', () => {
  it('creates temporal databases for each persona namespace', () => {
    expect(existsSync(personaADatabasePath) && existsSync(personaBDatabasePath)).toBe(true);
  });

  it('persists exactly inbound+outbound messages in each persona database', () => {
    expect(personaAMessageCount === 2 && personaBMessageCount === 2).toBe(true);
  });

  it('prevents cross-persona thread contamination in persona-a storage', () => {
    expect(personaAHasForeignThread).toBe(false);
  });

  it('prevents cross-persona thread contamination in persona-b storage', () => {
    expect(personaBHasForeignThread).toBe(false);
  });
});
