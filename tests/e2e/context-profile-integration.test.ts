import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runHarnessForInboundMessage, runHarnessForPersistedInboundMessage } from '@engine/harness/runtime';
import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { loadNetworkFixture } from '@tests/network';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let emailProfileSystemMessage = '';
let responsibilityProfileSystemMessage = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let providerScaffold!: ReturnType<typeof scaffoldProviderConfig>;

/**
 * Returns one inbound email-shaped test message for thread profile assertions.
 */
function createEmailInboundMessage(): InboundNormalizedMessage {
  return {
    personaId: 'persona-context-profile',
    messageId: '<thread-profile-1@example.com>',
    threadId: 'thread-profile-1',
    from: [{ address: 'sender@example.com' }],
    to: [{ address: 'agent@example.com' }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: 'agent@example.com' }],
    subject: 'Thread profile test',
    text: 'Email profile input',
    references: [],
    receivedAt: '2026-03-05T00:00:00.000Z',
    rawMimePath: '/tmp/thread-profile.eml',
    attachments: [],
  };
}

/**
 * Returns one synthetic responsibility inbound message for responsibility profile assertions.
 */
function createResponsibilityInboundMessage(): InboundNormalizedMessage {
  return {
    personaId: 'persona-context-profile',
    messageId: '<responsibility-profile-1@example.com>',
    threadId: 'responsibility-profile-1',
    from: [{ address: 'responsibility@localhost' }],
    to: [{ address: 'agent@example.com' }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: 'agent@example.com' }],
    subject: 'Responsibility profile test',
    text: 'Responsibility profile input',
    references: [],
    receivedAt: '2026-03-05T00:01:00.000Z',
    rawMimePath: '__responsibility__',
    attachments: [],
    metadata: {
      source: 'responsibility',
      responsibility: {
        id: 'profile-test',
        name: 'Profile Test',
        schedule: '* * * * *',
        promptPath: 'personas/persona-context-profile/responsibilities/profile-test.md',
        promptHash: 'fixture',
        enabled: true,
      },
    },
  };
}

/**
 * Returns one provider request system message text payload for assertions.
 */
function readSystemMessageText(
  args: {
    messages: Array<Record<string, unknown>>;
  },
): string {
  const systemMessage = args.messages.find((message) => message.role === 'system');
  if (!systemMessage || typeof systemMessage.content !== 'string') {
    return '';
  }

  return systemMessage.content;
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-context-profile-e2e-',
  });
  tempRootPath = workspace.tempRootPath;
  providerScaffold = scaffoldProviderConfig({
    workspace,
    providerName: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKeyValue: 'test-openai-key',
    providerConfig: {
      base_url: 'https://api.openai.com/v1',
    },
  });

  workspace.patchPersona({
    personaId: 'persona-context-profile',
    personaPatch: {
      personaId: 'persona-context-profile',
      publicKeyBase32: 'fixture',
      emailLocalPart: 'fixture',
      emailAddress: 'agent@example.com',
      createdAt: '2026-03-05T00:00:00.000Z',
    },
  });
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['profile-marker(thread-profile)', 'current-input'],
      responsibility: ['profile-marker(responsibility-profile)', 'current-input'],
    },
  });
  workspace.patchExtensionsManifest({
    tools: [],
    hooks: [],
    resolvers: ['current-input', 'profile-marker'],
  });
  workspace.writeFile({
    relativePath: 'extensions/resolvers/profile-marker/index.js',
    payload: [
      'export const resolver = {',
      "  name: 'profile-marker',",
      '  resolve: async ({ resolverArgs }) => ({',
      "    sections: [`PROFILE:${String(resolverArgs[0] ?? 'missing')}`],",
      '  }),',
      '};',
    ].join('\n'),
  });

  const requestMessagesByCall: Array<Array<Record<string, unknown>>> = [];
  const fixture = loadNetworkFixture({ fixtureKey: 'openai/chat-completions/200' });
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    async ({ request }) => {
      const body = await request.json() as { messages?: Array<Record<string, unknown>> };
      requestMessagesByCall.push(body.messages ?? []);
      return HttpResponse.json(fixture.response.body as Record<string, unknown>, {
        status: fixture.response.status,
        headers: fixture.response.headers,
      });
    },
  ));

  await runHarnessForPersistedInboundMessage({
    message: createEmailInboundMessage(),
    senderAddress: 'agent@example.com',
  });
  await runHarnessForInboundMessage({
    message: createResponsibilityInboundMessage(),
    senderAddress: 'agent@example.com',
  });

  emailProfileSystemMessage = readSystemMessageText({
    messages: requestMessagesByCall[0] ?? [],
  });
  responsibilityProfileSystemMessage = readSystemMessageText({
    messages: requestMessagesByCall[1] ?? [],
  });
});

afterAll((): void => {
  providerScaffold.restoreEnv();
  workspace.cleanup();
});

describe('context profile integration', () => {
  it('uses thread pipeline profile for email-origin runs', () => {
    expect(emailProfileSystemMessage.includes('PROFILE:thread-profile')).toBe(true);
  });

  it('uses responsibility pipeline profile for responsibility-origin runs', () => {
    expect(responsibilityProfileSystemMessage.includes('PROFILE:responsibility-profile')).toBe(true);
  });

  it('does not cross-apply responsibility profile marker to email-origin runs', () => {
    expect(emailProfileSystemMessage.includes('PROFILE:responsibility-profile')).toBe(false);
  });

  it('does not cross-apply thread profile marker to responsibility-origin runs', () => {
    expect(responsibilityProfileSystemMessage.includes('PROFILE:thread-profile')).toBe(false);
  });
});
