import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildProviderMessages,
  createProviderAdapter,
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
let unsupportedProviderCode = '';

beforeAll((): void => {
  harnessInputSender = toHarnessInput({ message: inboundMessage }).sender;
  providerMessagesCount = buildProviderMessages({
    context: {
      activeMemory: 'Do not lose track of chronology.',
      history: [{ direction: 'inbound', messageId: 'message-0', text: 'Earlier question' }],
      input: { messageId: 'message-1', text: 'Latest question' },
    },
    systemPrompt: 'You are Protege.',
  }).length;
  deduplicatedProviderMessagesCount = buildProviderMessages({
    context: {
      activeMemory: '',
      history: [{ direction: 'inbound', messageId: 'message-1', text: 'Duplicate inbound' }],
      input: { messageId: 'message-1', text: 'Latest question' },
    },
    systemPrompt: '',
  }).length;

  try {
    createProviderAdapter({
      inferenceConfig: { providers: {} },
      provider: 'anthropic',
    });
  } catch (error) {
    unsupportedProviderCode = (error as HarnessProviderError).code;
  }
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

  it('raises unsupported_provider for unimplemented providers', () => {
    expect(unsupportedProviderCode).toBe('unsupported_provider');
  });
});
