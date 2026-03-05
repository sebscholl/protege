import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { InboundNormalizedMessage } from '@engine/gateway/types';

import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let temporalDbPath = '';
let capturedSecondRequestMessages: Array<Record<string, unknown>> = [];
let cleanupWorkspace = (): void => undefined;

const firstInboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-thread-history',
  messageId: '<thread-1@example.com>',
  threadId: 'thread-history-1',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'Thread history first turn',
  text: 'This is my first message.',
  references: [],
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/inbound-1.eml',
  attachments: [],
};

const secondInboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-thread-history',
  messageId: '<thread-2@example.com>',
  threadId: 'thread-history-1',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'Thread history second turn',
  text: 'Can you answer with context from before?',
  references: ['<thread-1@example.com>'],
  receivedAt: '2026-02-14T00:01:00.000Z',
  rawMimePath: '/tmp/inbound-2.eml',
  attachments: [],
};

beforeAll(async (): Promise<void> => {
  const workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-harness-thread-history-',
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
      createdAt: '2026-02-14T00:00:00.000Z',
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
      tools: [],
      hooks: [],
      providers: ['openai'],
      resolvers: ['thread-history', 'current-input'],
    }),
  );

  const requestMessagesByCall: Array<Array<Record<string, unknown>>> = [];
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    async ({ request }) => {
      const body = await request.json() as { messages?: Array<Record<string, unknown>> };
      requestMessagesByCall.push(body.messages ?? []);
      return HttpResponse.json({
        id: 'chatcmpl_fixture_200',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Fixture response',
            },
          },
        ],
      }, {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));

  persistInboundMessageForRuntime({
    message: firstInboundMessage,
  });
  await runHarnessForPersistedInboundMessage({
    message: firstInboundMessage,
    senderAddress: 'protege@localhost',
  });

  persistInboundMessageForRuntime({
    message: secondInboundMessage,
  });
  await runHarnessForPersistedInboundMessage({
    message: secondInboundMessage,
    senderAddress: 'protege@localhost',
  });

  capturedSecondRequestMessages = requestMessagesByCall[1] ?? [];
  temporalDbPath = join(
    tempRootPath,
    'memory',
    firstInboundMessage.personaId as string,
    'temporal.db',
  );
});

afterAll((): void => {
  cleanupWorkspace();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
});

describe('harness runtime thread history', () => {
  it('creates temporal storage while processing threaded turns', () => {
    expect(existsSync(temporalDbPath)).toBe(true);
  });

  it('passes previous inbound turns to provider context for later thread turns', () => {
    expect(capturedSecondRequestMessages.some(
      (message) => message.role === 'user'
        && typeof message.content === 'string'
        && message.content.includes('This is my first message.'),
    )).toBe(true);
  });

  it('passes previous outbound turns to provider context for later thread turns', () => {
    expect(capturedSecondRequestMessages.some(
      (message) => message.role === 'assistant'
        && typeof message.content === 'string'
        && message.content.includes('Fixture response'),
    )).toBe(true);
  });

  it('includes the latest inbound turn as the final user message', () => {
    const lastMessage = capturedSecondRequestMessages[capturedSecondRequestMessages.length - 1];
    expect(typeof lastMessage?.content === 'string'
      && lastMessage.content.includes('Can you answer with context from before?')).toBe(true);
  });
});
