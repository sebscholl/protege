import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
let temporalDbPath = '';
let secondTurnProviderMessages: Array<Record<string, unknown>> = [];
let threadToolEventCount = 0;
let cleanupWorkspace = (): void => undefined;

const firstInboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-tool-trace-history',
  messageId: '<tool-trace-1@example.com>',
  threadId: 'tool-trace-history-thread',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'Tool trace first turn',
  text: 'Please respond and use a tool.',
  references: [],
  receivedAt: '2026-03-04T10:00:00.000Z',
  rawMimePath: '/tmp/tool-trace-1.eml',
  attachments: [],
};

const secondInboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-tool-trace-history',
  messageId: '<tool-trace-2@example.com>',
  threadId: 'tool-trace-history-thread',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'Tool trace second turn',
  text: 'What happened before?',
  references: ['<tool-trace-1@example.com>'],
  receivedAt: '2026-03-04T10:01:00.000Z',
  rawMimePath: '/tmp/tool-trace-2.eml',
  attachments: [],
};

beforeAll(async (): Promise<void> => {
  const workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-runtime-tool-trace-history-',
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;
  cleanupWorkspace = workspace.cleanup;
  process.env.OPENAI_API_KEY = 'test-key';

  mkdirSync(join(tempRootPath, 'extensions', 'providers', 'openai'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', firstInboundMessage.personaId as string), {
    recursive: true,
  });

  writeFileSync(
    join(tempRootPath, 'personas', firstInboundMessage.personaId as string, 'persona.json'),
    JSON.stringify({
      personaId: firstInboundMessage.personaId,
      publicKeyBase32: 'fixture',
      emailLocalPart: 'fixture',
      createdAt: '2026-03-04T10:00:00.000Z',
    }),
  );
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['thread-history', 'current-input'],
      responsibility: ['current-input'],
    },
  });
  writeFileSync(
    join(tempRootPath, 'extensions', 'providers', 'openai', 'config.json'),
    JSON.stringify({
      api_key_env: 'OPENAI_API_KEY',
      base_url: 'https://api.openai.com/v1',
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'extensions.json'),
    JSON.stringify({
      tools: ['send-email'],
      hooks: [],
      providers: ['openai'],
      resolvers: ['thread-history', 'current-input'],
    }),
  );

  let providerCallCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    async ({ request }) => {
      const body = await request.json() as { messages?: Array<Record<string, unknown>> };
      if (providerCallCount === 0) {
        providerCallCount += 1;
        return HttpResponse.json({
          id: 'chatcmpl_tool_trace_0',
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'call_send_email_trace_1',
                type: 'function',
                function: {
                  name: 'send_email',
                  arguments: JSON.stringify({
                    to: ['sender@example.com'],
                    subject: 'Trace',
                    text: 'Trace body',
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        });
      }

      if (providerCallCount === 1) {
        providerCallCount += 1;
        return HttpResponse.json({
          id: 'chatcmpl_tool_trace_1',
          choices: [{
            message: {
              role: 'assistant',
              content: 'First turn complete.',
            },
            finish_reason: 'stop',
          }],
        });
      }

      secondTurnProviderMessages = body.messages ?? [];
      providerCallCount += 1;
      return HttpResponse.json({
        id: 'chatcmpl_tool_trace_2',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Second turn complete.',
          },
          finish_reason: 'stop',
        }],
      });
    },
  ));

  persistInboundMessageForRuntime({
    message: firstInboundMessage,
  });
  await runHarnessForPersistedInboundMessage({
    message: firstInboundMessage,
    senderAddress: 'protege@localhost',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => ({
      messageId: '<runtime-action-send@example.com>',
    }),
  });

  persistInboundMessageForRuntime({
    message: secondInboundMessage,
  });
  await runHarnessForPersistedInboundMessage({
    message: secondInboundMessage,
    senderAddress: 'protege@localhost',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => ({
      messageId: '<runtime-action-send-2@example.com>',
    }),
  });

  temporalDbPath = join(
    tempRootPath,
    'memory',
    firstInboundMessage.personaId as string,
    'temporal.db',
  );
  if (existsSync(temporalDbPath)) {
    const db = new Database(temporalDbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) AS count FROM thread_tool_events').get() as { count: number };
    threadToolEventCount = row.count;
    db.close();
  }
});

afterAll((): void => {
  cleanupWorkspace();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
});

describe('harness runtime tool-trace continuity', () => {
  it('persists tool events for the first turn in thread_tool_events', () => {
    expect(threadToolEventCount >= 2).toBe(true);
  });

  it('includes prior tool call trace in second-turn provider context', () => {
    expect(secondTurnProviderMessages.some(
      (message) => message.role === 'user'
        && typeof message.content === 'string'
        && message.content.includes('Tool call (send_email)'),
    )).toBe(true);
  });

  it('includes prior tool result trace in second-turn provider context', () => {
    expect(secondTurnProviderMessages.some(
      (message) => message.role === 'user'
        && typeof message.content === 'string'
        && message.content.includes('Tool result (send_email)'),
    )).toBe(true);
  });
});
