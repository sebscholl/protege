import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let providerSawPriorToolTrace = false;
let persistedToolEventCount = 0;
let cleanupWorkspace = (): void => undefined;

const inboundTurnOne: InboundNormalizedMessage = {
  personaId: 'persona-e2e-tool-trace',
  messageId: '<tool-trace-e2e-1@example.com>',
  threadId: 'thread-tool-trace-e2e-1',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'E2E tool trace turn one',
  text: 'Run one with tool.',
  references: [],
  receivedAt: '2026-03-04T12:00:00.000Z',
  rawMimePath: '/tmp/e2e-tool-trace-1.eml',
  attachments: [],
};

const inboundTurnTwo: InboundNormalizedMessage = {
  personaId: 'persona-e2e-tool-trace',
  messageId: '<tool-trace-e2e-2@example.com>',
  threadId: 'thread-tool-trace-e2e-1',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'E2E tool trace turn two',
  text: 'Run two should see prior tool context.',
  references: ['<tool-trace-e2e-1@example.com>'],
  receivedAt: '2026-03-04T12:01:00.000Z',
  rawMimePath: '/tmp/e2e-tool-trace-2.eml',
  attachments: [],
};

beforeAll(async (): Promise<void> => {
  const workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-thread-tool-trace-',
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;
  cleanupWorkspace = workspace.cleanup;
  process.env.OPENAI_API_KEY = 'test-key';

  mkdirSync(join(tempRootPath, 'extensions', 'providers', 'openai'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', inboundTurnOne.personaId as string), {
    recursive: true,
  });
  writeFileSync(
    join(tempRootPath, 'extensions', 'extensions.json'),
    JSON.stringify({
      tools: ['send-email'],
      hooks: [],
      providers: ['openai'],
      resolvers: ['thread-history', 'current-input'],
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'providers', 'openai', 'config.json'),
    JSON.stringify({
      api_key_env: 'OPENAI_API_KEY',
      base_url: 'https://api.openai.com/v1',
    }),
  );

  writeFileSync(
    join(tempRootPath, 'personas', inboundTurnOne.personaId as string, 'persona.json'),
    JSON.stringify({
      personaId: inboundTurnOne.personaId,
      publicKeyBase32: 'fixture-e2e',
      emailLocalPart: 'fixture-e2e',
      createdAt: '2026-03-04T12:00:00.000Z',
    }),
  );
  workspace.patchConfigFiles({
    'system-prompt.md': 'You are Protege.',
    'inference.json': {
      provider: 'openai',
      model: 'gpt-4.1',
      recursion_depth: 3,
    },
    'context.json': {
      thread: ['thread-history', 'current-input'],
      responsibility: ['current-input'],
    },
    'system.json': {
      logs_dir_path: join(tempRootPath, 'tmp', 'logs'),
      console_log_format: 'json',
    },
  });

  let callCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    async ({ request }) => {
      const body = await request.json() as { messages?: Array<Record<string, unknown>> };
      if (callCount === 0) {
        callCount += 1;
        return HttpResponse.json({
          id: 'chatcmpl_e2e_0',
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'call_send_email_e2e_1',
                type: 'function',
                function: {
                  name: 'send_email',
                  arguments: JSON.stringify({
                    to: ['sender@example.com'],
                    subject: 'E2E',
                    text: 'E2E body',
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        });
      }

      if (callCount === 1) {
        callCount += 1;
        return HttpResponse.json({
          id: 'chatcmpl_e2e_1',
          choices: [{
            message: {
              role: 'assistant',
              content: 'Turn one complete.',
            },
            finish_reason: 'stop',
          }],
        });
      }

      providerSawPriorToolTrace = (body.messages ?? []).some(
        (message) => message.role === 'user'
          && typeof message.content === 'string'
          && message.content.includes('Tool result (send_email)'),
      );
      callCount += 1;
      return HttpResponse.json({
        id: 'chatcmpl_e2e_2',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Turn two complete.',
          },
          finish_reason: 'stop',
        }],
      });
    },
  ));

  persistInboundMessageForRuntime({
    message: inboundTurnOne,
  });
  await runHarnessForPersistedInboundMessage({
    message: inboundTurnOne,
    senderAddress: 'protege@localhost',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => ({
      messageId: '<e2e-runtime-action-1@example.com>',
    }),
  });

  persistInboundMessageForRuntime({
    message: inboundTurnTwo,
  });
  await runHarnessForPersistedInboundMessage({
    message: inboundTurnTwo,
    senderAddress: 'protege@localhost',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => ({
      messageId: '<e2e-runtime-action-2@example.com>',
    }),
  });

  const db = new Database(
    join(tempRootPath, 'memory', inboundTurnOne.personaId as string, 'temporal.db'),
    { readonly: true },
  );
  const row = db.prepare('SELECT COUNT(*) AS count FROM thread_tool_events').get() as { count: number };
  persistedToolEventCount = row.count;
  db.close();
});

afterAll((): void => {
  cleanupWorkspace();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
});

describe('e2e thread tool trace continuity', () => {
  it('persists tool events to thread_tool_events table during run one', () => {
    expect(persistedToolEventCount >= 2).toBe(true);
  });

  it('loads persisted tool traces into turn-two provider context', () => {
    expect(providerSawPriorToolTrace).toBe(true);
  });
});
