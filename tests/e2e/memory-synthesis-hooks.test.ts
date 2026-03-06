import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HOOK_EVENT } from '@engine/harness/hooks/events';
import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { initializeDatabase } from '@engine/shared/database';
import { createPersona, resolveDefaultPersonaRoots, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { mswIntercept } from '@tests/network';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let threadMemoryRowCount = 0;
let dirtyStateCleared = false;
let activeMemoryUpdated = false;
let emittedMemoryActiveUpdated = false;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-memory-hooks-',
    symlinkExtensionsFromRepo: true,
  });

  workspace.writeFile({
    relativePath: 'prompts/thread-summary.md',
    payload: 'Summarize thread deltas in one sentence.',
  });
  workspace.writeFile({
    relativePath: 'prompts/active-summary.md',
    payload: 'Summarize persona active memory in one sentence.',
  });

  process.env.OPENAI_API_KEY = 'test-openai-key';
  mswIntercept({ fixtureKey: 'openai/chat-completions/200' });

  const persona = createPersona({
    roots: resolveDefaultPersonaRoots(),
  });
  const memoryPaths = resolvePersonaMemoryPaths({
    personaId: persona.personaId,
    roots: resolveDefaultPersonaRoots(),
  });
  const db = initializeDatabase({
    databasePath: memoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  db.prepare(`
    INSERT INTO threads (id, root_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(
    'thread-a',
    '<m1>',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z',
  );
  db.prepare(`
    INSERT INTO messages (
      id,
      thread_id,
      direction,
      message_id,
      in_reply_to,
      sender,
      recipients,
      subject,
      text_body,
      html_body,
      received_at,
      raw_mime_path,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'msg-1',
    'thread-a',
    'inbound',
    '<m1>',
    null,
    'sender@example.com',
    JSON.stringify([persona.emailAddress]),
    'subject one',
    'hello from sender',
    null,
    '2026-03-06T00:01:00.000Z',
    '__fixture__.eml',
    JSON.stringify({}),
  );
  db.close();

  const hooks = await loadHookRegistry();
  const hookDispatcher = createHookDispatcher({
    hooks,
  });
  hookDispatcher.dispatch(HOOK_EVENT.HarnessInferenceCompleted, {
    level: 'info',
    scope: 'harness',
    event: HOOK_EVENT.HarnessInferenceCompleted,
    timestamp: '2026-03-06T00:02:00.000Z',
    correlationId: 'memory-hooks-e2e',
    personaId: persona.personaId,
    threadId: 'thread-a',
    messageId: '<m1>',
    responseMessageId: '<m2>',
    suppressedFinalPersistence: false,
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 120);
  });

  const verifyDb = initializeDatabase({
    databasePath: memoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  threadMemoryRowCount = Number((verifyDb.prepare(
    'SELECT COUNT(1) AS count FROM thread_memory_states WHERE thread_id = ?',
  ).get('thread-a') as { count?: number } | undefined)?.count ?? 0);
  dirtyStateCleared = Number((verifyDb.prepare(
    'SELECT dirty AS dirty FROM persona_memory_synthesis_state WHERE persona_id = ?',
  ).get(persona.personaId) as { dirty?: number } | undefined)?.dirty ?? 1) === 0;
  verifyDb.close();

  const activeText = readFileSync(memoryPaths.activeMemoryPath, 'utf8').trim();
  activeMemoryUpdated = activeText.includes('Fixture response');

  const emittedEvents: string[] = [];
  const chainedDispatcher = createHookDispatcher({
    hooks: [
      {
        name: 'capture',
        events: [HOOK_EVENT.MemoryActiveUpdated],
        config: {},
        onEvent: async (event): Promise<void> => {
          emittedEvents.push(event);
        },
      },
    ],
  });
  chainedDispatcher.dispatch(HOOK_EVENT.MemoryActiveUpdated, {
    level: 'info',
    scope: 'memory',
    event: HOOK_EVENT.MemoryActiveUpdated,
    timestamp: new Date().toISOString(),
    personaId: persona.personaId,
    threadId: 'thread-a',
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  emittedMemoryActiveUpdated = emittedEvents.includes(HOOK_EVENT.MemoryActiveUpdated);
});

afterAll((): void => {
  workspace.cleanup();
  delete process.env.OPENAI_API_KEY;
});

describe('e2e memory synthesis hooks', () => {
  it('persists thread-memory state after harness inference completion events', () => {
    expect(threadMemoryRowCount).toBe(1);
  });

  it('clears persona dirty state after active-memory synthesis succeeds', () => {
    expect(dirtyStateCleared).toBe(true);
  });

  it('writes synthesized active memory content to persona active.md', () => {
    expect(activeMemoryUpdated).toBe(true);
  });

  it('supports memory.active.updated hook event subscriptions', () => {
    expect(emittedMemoryActiveUpdated).toBe(true);
  });
});
