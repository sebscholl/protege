import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  persistInboundMessageForRuntime,
  runHarnessForPersistedInboundMessage,
} from '@engine/harness/runtime';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let temporalDbPath = '';
let capturedSecondRequestMessages: Array<Record<string, unknown>> = [];
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let providerScaffold!: ReturnType<typeof scaffoldProviderConfig>;

const firstInboundMessage = createInboundMessage({
  personaId: 'persona-thread-history',
  messageId: '<thread-1@example.com>',
  threadId: 'thread-history-1',
  subject: 'Thread history first turn',
  text: 'This is my first message.',
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/inbound-1.eml',
});

const secondInboundMessage = createInboundMessage({
  personaId: 'persona-thread-history',
  messageId: '<thread-2@example.com>',
  threadId: 'thread-history-1',
  subject: 'Thread history second turn',
  text: 'Can you answer with context from before?',
  references: ['<thread-1@example.com>'],
  receivedAt: '2026-02-14T00:01:00.000Z',
  rawMimePath: '/tmp/inbound-2.eml',
});

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-harness-thread-history-',
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
    personaId: firstInboundMessage.personaId as string,
    personaPatch: {
      personaId: firstInboundMessage.personaId,
      publicKeyBase32: 'fixture',
      emailLocalPart: 'fixture',
      createdAt: '2026-02-14T00:00:00.000Z',
    },
  });
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['thread-history', 'current-input'],
      responsibility: ['current-input'],
    },
  });
  workspace.patchExtensionsManifest({
    tools: [],
    hooks: [],
    resolvers: ['thread-history', 'current-input'],
  });

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
    logger: workspace.logger,
  });
  await runHarnessForPersistedInboundMessage({
    message: firstInboundMessage,
    senderAddress: 'protege@localhost',
  
    logger: workspace.logger,});

  persistInboundMessageForRuntime({
    message: secondInboundMessage,
    logger: workspace.logger,
  });
  await runHarnessForPersistedInboundMessage({
    message: secondInboundMessage,
    senderAddress: 'protege@localhost',
  
    logger: workspace.logger,});

  capturedSecondRequestMessages = requestMessagesByCall[1] ?? [];
  temporalDbPath = join(
    tempRootPath,
    'memory',
    firstInboundMessage.personaId as string,
    'temporal.db',
  );
});

afterAll((): void => {
  providerScaffold.restoreEnv();
  workspace.cleanup();
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
