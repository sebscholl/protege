import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { existsSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildInboundRoutingContextNote,
  buildProviderMessages,
  createProviderAdapter,
  resolveMigrationsDirPath,
  shouldAcceptEmptyTerminalResponse,
  shouldSuppressFinalResponsePersistence,
  toHarnessInput,
} from '@engine/harness/runtime';
import { HarnessProviderError } from '@engine/harness/provider-contract';

const inboundMessage: InboundNormalizedMessage = {
  personaId: 'persona-1',
  messageId: '<message-1@example.com>',
  threadId: 'thread-1',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'agent@example.com' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'agent@example.com' }],
  subject: 'Hello',
  text: 'What happened?',
  references: [],
  receivedAt: '2026-02-14T00:00:00.000Z',
  rawMimePath: '/tmp/inbound.eml',
  attachments: [],
};

let harnessInputSender = '';
let providerMessagesCount = 0;
let deduplicatedProviderMessagesCount = 0;
let routingContextIncluded = false;
let routingContextHasAllKeys = false;
let routingContextIsEmptyWithoutMetadata = false;
let unsupportedProviderCode = '';
let migrationsDirExists = false;
let suppressesOnEmailSend = false;
let keepsPersistenceWhenNoActionMatch = false;
let anthropicAdapterProviderId = '';
let anthropicMissingApiKeyMessage = '';
let geminiAdapterProviderId = '';
let geminiMissingApiKeyMessage = '';
let acceptsNonEmptyTerminalResponse = false;
let acceptsEmptyTerminalResponseWithActions = false;
let rejectsEmptyTerminalResponseWithoutActions = false;

beforeAll((): void => {
  harnessInputSender = toHarnessInput({ message: inboundMessage }).sender;
  providerMessagesCount = buildProviderMessages({
    context: {
      threadId: 'thread-1',
      activeMemory: 'Do not lose track of chronology.',
      history: [{ direction: 'inbound', messageId: 'message-0', text: 'Earlier question' }],
      input: {
        messageId: 'message-1',
        text: 'Latest question',
        metadata: {
          from: ['sender@example.com'],
          to: ['agent@example.com'],
          cc: ['patricia@example.com'],
          bcc: [],
          references: ['<parent@example.com>'],
          replyToDefault: 'sender@example.com',
          replyFromAddress: 'persona@example.com',
        },
      },
    },
    systemPrompt: 'You are Protege.',
  }).length;
  deduplicatedProviderMessagesCount = buildProviderMessages({
    context: {
      threadId: 'thread-1',
      activeMemory: '',
      history: [{ direction: 'inbound', messageId: 'message-1', text: 'Duplicate inbound' }],
      input: { messageId: 'message-1', text: 'Latest question' },
    },
    systemPrompt: '',
  }).length;
  const routingMessages = buildProviderMessages({
    context: {
      threadId: 'thread-1',
      activeMemory: '',
      history: [],
      input: {
        messageId: 'message-1',
        text: 'Respond to Patricia.',
        metadata: {
          from: ['sender@example.com'],
          to: ['agent@example.com'],
          cc: ['patricia@example.com'],
          bcc: [],
          references: ['<parent@example.com>'],
          replyToDefault: 'sender@example.com',
          replyFromAddress: 'persona@example.com',
        },
      },
    },
    systemPrompt: 'You are Protege.',
  });
  routingContextIncluded = routingMessages[0]?.parts[0]?.text.includes('patricia@example.com')
    && routingMessages[0]?.parts[0]?.text.includes('send_email')
    && routingMessages[0]?.parts[0]?.text.includes('reply_to_default: sender@example.com')
    && routingMessages[0]?.parts[0]?.text.includes('reply_from_address: persona@example.com');
  const routingContextNote = buildInboundRoutingContextNote({
    input: {
      messageId: 'message-1',
      metadata: {
        from: ['sender@example.com'],
        to: ['agent@example.com'],
        cc: ['patricia@example.com'],
        bcc: ['auditor@example.com'],
        references: ['<parent@example.com>'],
        replyToDefault: 'sender@example.com',
        replyFromAddress: 'persona@example.com',
      },
    },
    threadId: 'thread-1',
  });
  routingContextHasAllKeys = routingContextNote.includes('reply_to_default:')
    && routingContextNote.includes('reply_from_address:')
    && routingContextNote.includes('- from:')
    && routingContextNote.includes('- to:')
    && routingContextNote.includes('- cc:')
    && routingContextNote.includes('- bcc:')
    && routingContextNote.includes('- references:')
    && routingContextNote.includes('Do not use labels like "user"');
  routingContextIsEmptyWithoutMetadata = buildInboundRoutingContextNote({
    input: {
      messageId: 'message-empty',
      metadata: {},
    },
    threadId: 'thread-empty',
  }).length === 0;

  try {
    createProviderAdapter({
      inferenceConfig: { providers: {} },
      provider: 'grok',
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }
  anthropicAdapterProviderId = createProviderAdapter({
    inferenceConfig: {
      providers: {
        anthropic: {
          apiKey: 'anthropic-test',
        },
      },
    },
    provider: 'anthropic',
  }).providerId;
  try {
    createProviderAdapter({
      inferenceConfig: {
        providers: {
          anthropic: {},
        },
      },
      provider: 'anthropic',
    });
  } catch (error) {
    anthropicMissingApiKeyMessage = (error as Error).message;
  }
  geminiAdapterProviderId = createProviderAdapter({
    inferenceConfig: {
      providers: {
        gemini: {
          apiKey: 'gemini-test',
        },
      },
    },
    provider: 'gemini',
  }).providerId;
  try {
    createProviderAdapter({
      inferenceConfig: {
        providers: {
          gemini: {},
        },
      },
      provider: 'gemini',
    });
  } catch (error) {
    geminiMissingApiKeyMessage = (error as Error).message;
  }

  migrationsDirExists = existsSync(resolveMigrationsDirPath());
  suppressesOnEmailSend = shouldSuppressFinalResponsePersistence({
    invokedActions: ['email.send', 'file.read'],
    suppressedActions: ['email.send'],
  });
  keepsPersistenceWhenNoActionMatch = shouldSuppressFinalResponsePersistence({
    invokedActions: ['file.read'],
    suppressedActions: ['email.send'],
  });
  acceptsNonEmptyTerminalResponse = shouldAcceptEmptyTerminalResponse({
    responseText: 'hello',
    invokedActions: [],
  });
  acceptsEmptyTerminalResponseWithActions = shouldAcceptEmptyTerminalResponse({
    responseText: '',
    invokedActions: ['email.send'],
  });
  rejectsEmptyTerminalResponseWithoutActions = shouldAcceptEmptyTerminalResponse({
    responseText: '',
    invokedActions: [],
  });
});

describe('harness runtime helpers', () => {
  it('builds harness input sender from inbound from-address', () => {
    expect(harnessInputSender).toBe('sender@example.com');
  });

  it('builds provider messages including system/history/input entries', () => {
    expect(providerMessagesCount).toBe(3);
  });

  it('excludes current inbound message from history to avoid duplicate user turns', () => {
    expect(deduplicatedProviderMessagesCount).toBe(1);
  });

  it('injects inbound routing context with concrete addresses for tool calls', () => {
    expect(routingContextIncluded).toBe(true);
  });

  it('includes the full routing context key set when metadata exists', () => {
    expect(routingContextHasAllKeys).toBe(true);
  });

  it('omits routing context note when metadata is absent', () => {
    expect(routingContextIsEmptyWithoutMetadata).toBe(true);
  });

  it('raises unsupported_provider for unimplemented providers', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });

  it('creates anthropic provider adapter when anthropic credentials are present', () => {
    expect(anthropicAdapterProviderId).toBe('anthropic');
  });

  it('fails anthropic provider selection when anthropic credentials are missing', () => {
    expect(anthropicMissingApiKeyMessage).toContain('Missing Anthropic API key');
  });

  it('creates gemini provider adapter when gemini credentials are present', () => {
    expect(geminiAdapterProviderId).toBe('gemini');
  });

  it('fails gemini provider selection when gemini credentials are missing', () => {
    expect(geminiMissingApiKeyMessage).toContain('Missing Gemini API key');
  });

  it('resolves one existing migrations directory path', () => {
    expect(migrationsDirExists).toBe(true);
  });

  it('suppresses final persistence when configured action was invoked', () => {
    expect(suppressesOnEmailSend).toBe(true);
  });

  it('does not suppress final persistence when no configured action was invoked', () => {
    expect(keepsPersistenceWhenNoActionMatch).toBe(false);
  });

  it('accepts non-empty terminal provider responses', () => {
    expect(acceptsNonEmptyTerminalResponse).toBe(true);
  });

  it('accepts empty terminal provider responses when actions were invoked', () => {
    expect(acceptsEmptyTerminalResponseWithActions).toBe(true);
  });

  it('rejects empty terminal provider responses when no action was invoked', () => {
    expect(rejectsEmptyTerminalResponseWithoutActions).toBe(false);
  });
});
