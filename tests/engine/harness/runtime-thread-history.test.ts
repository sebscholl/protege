import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { InboundNormalizedMessage } from '@engine/gateway/types';

import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let temporalDbPath = '';
let capturedSecondRequestMessages: Array<Record<string, unknown>> = [];

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
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-harness-thread-history-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);
  process.env.OPENAI_API_KEY = 'test-key';

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });
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
  writeFileSync(
    join(tempRootPath, 'config', 'inference.json'),
    JSON.stringify({
      provider: 'openai',
      model: 'gpt-4.1',
      recursion_depth: 3,
    }),
  );
  writeFileSync(join(tempRootPath, 'config', 'system-prompt.md'), 'You are Protege.');
  writeFileSync(
    join(tempRootPath, 'extensions', 'providers', 'openai', 'config.json'),
    JSON.stringify({
      api_key_env: 'OPENAI_API_KEY',
      base_url: 'https://api.openai.com/v1',
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'extensions.json'),
    JSON.stringify({ tools: [], hooks: [] }),
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
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
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
