import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';

import { HOOK_EVENT } from '@engine/harness/hooks/events';
import { createHookDispatcher, loadHookRegistry } from '@engine/harness/hooks/registry';
import { recoverDirtyMemorySynthesisStates } from '@engine/harness/hooks/recovery';
import { readPersonaMemorySynthesisState } from '@engine/harness/memory/storage';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { initializeDatabase } from '@engine/shared/database';
import { createPersona, resolveDefaultPersonaRoots, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { networkServer } from '@tests/network/server';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let personaId = '';
let dirtyAfterFailure = false;
let errorMessageAfterFailure = '';
let dirtyAfterRecovery = true;
let activeMemoryRecovered = false;
let observedHookFailures = 0;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-memory-recovery-',
    symlinkExtensionsFromRepo: true,
  });

  workspace.writeFile({
    relativePath: 'prompts/thread-summary.md',
    payload: 'Summarize thread deltas in one sentence.',
  });
  workspace.writeFile({
    relativePath: 'prompts/active-summary.md',
    payload: 'Summarize active memory in one sentence.',
  });

  process.env.OPENAI_API_KEY = 'test-openai-key';

  let callCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    async () => {
      callCount += 1;
      if (callCount === 1) {
        return HttpResponse.json({
          id: 'chatcmpl_thread_summary_ok',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'thread summary one',
              },
              finish_reason: 'stop',
            },
          ],
        });
      }

      if (callCount === 2) {
        return HttpResponse.json({
          error: {
            message: 'active synthesis temporary failure',
          },
        }, {
          status: 500,
        });
      }

      return HttpResponse.json({
        id: 'chatcmpl_active_summary_recovered',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'recovered active memory summary',
            },
            finish_reason: 'stop',
          },
        ],
      });
    },
  ));

  const persona = createPersona({
    roots: resolveDefaultPersonaRoots(),
  });
  personaId = persona.personaId;
  const memoryPaths = resolvePersonaMemoryPaths({
    personaId,
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
    'thread-recovery-a',
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
    'msg-recovery-1',
    'thread-recovery-a',
    'inbound',
    '<m1>',
    null,
    'sender@example.com',
    JSON.stringify([persona.emailAddress]),
    'subject recovery',
    'hello from sender',
    null,
    '2026-03-06T00:01:00.000Z',
    'fixture.eml',
    JSON.stringify({}),
  );
  db.close();

  const hooks = await loadHookRegistry();
  const hookDispatcher = createHookDispatcher({
    hooks,
    onHookError: (): void => {
      observedHookFailures += 1;
    },
  });

  hookDispatcher.dispatch(HOOK_EVENT.HarnessInferenceCompleted, {
    level: 'info',
    scope: 'harness',
    event: HOOK_EVENT.HarnessInferenceCompleted,
    timestamp: '2026-03-06T00:02:00.000Z',
    correlationId: 'memory-recovery-e2e',
    personaId,
    threadId: 'thread-recovery-a',
    messageId: '<m1>',
    responseMessageId: '<m2>',
    suppressedFinalPersistence: false,
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 140);
  });

  const verifyFailureDb = initializeDatabase({
    databasePath: memoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  const failureState = readPersonaMemorySynthesisState({
    db: verifyFailureDb,
    personaId,
  });
  dirtyAfterFailure = Boolean(failureState?.dirty);
  errorMessageAfterFailure = String(failureState?.lastErrorMessage ?? '');
  verifyFailureDb.close();

  const restartHooks = await loadHookRegistry();
  const restartHookDispatcher = createHookDispatcher({
    hooks: restartHooks,
    onHookError: (): void => {
      observedHookFailures += 1;
    },
  });
  recoverDirtyMemorySynthesisStates({
    hookDispatcher: restartHookDispatcher,
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 140);
  });

  const verifyRecoveryDb = initializeDatabase({
    databasePath: memoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  const recoveryState = readPersonaMemorySynthesisState({
    db: verifyRecoveryDb,
    personaId,
  });
  dirtyAfterRecovery = Boolean(recoveryState?.dirty);
  verifyRecoveryDb.close();

  const activeText = readFileSync(memoryPaths.activeMemoryPath, 'utf8');
  activeMemoryRecovered = activeText.includes('recovered active memory summary');
});

afterAll((): void => {
  workspace.cleanup();
  delete process.env.OPENAI_API_KEY;
});

describe('e2e memory synthesis failure recovery', () => {
  it('marks persona memory synthesis state dirty when active-memory synthesis fails', () => {
    expect(dirtyAfterFailure).toBe(true);
  });

  it('persists active-memory synthesis failure details for operator visibility', () => {
    expect(errorMessageAfterFailure.length > 0).toBe(true);
  });

  it('re-dispatches dirty memory synthesis states after startup recovery sweep', () => {
    expect(dirtyAfterRecovery).toBe(false);
  });

  it('writes recovered active memory summary after recovery dispatch', () => {
    expect(activeMemoryRecovered).toBe(true);
  });

  it('records hook failures during the first failed active-memory attempt', () => {
    expect(observedHookFailures > 0).toBe(true);
  });
});
