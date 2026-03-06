import { beforeAll, describe, expect, it } from 'vitest';

import { buildEmailSendRequestFromAction } from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';

let defaultHeaderValue = '';
let decrementedHeaderValue = '';
let forcedHeaderStillUsesCalculatedValue = '';

beforeAll((): void => {
  const messageWithoutRecursion = createInboundMessage({
    personaId: 'persona-test',
    messageId: '<base@example.com>',
    threadId: 'thread-1',
    subject: 'Hello',
    text: 'Body',
  });
  const defaultRequest = buildEmailSendRequestFromAction({
    message: messageWithoutRecursion,
    personaSenderAddress: 'persona@example.com',
    payload: {
      to: ['receiver@example.com'],
      subject: 'Reply',
      text: 'Body',
    },
    defaultRecursionDepth: 6,
  });
  defaultHeaderValue = String(defaultRequest.headers?.['X-Protege-Recursion'] ?? '');

  const messageWithRecursionRemaining = createInboundMessage({
    personaId: 'persona-test',
    messageId: '<remaining@example.com>',
    threadId: 'thread-2',
    subject: 'Hello',
    text: 'Body',
    metadata: {
      recursion_remaining: 2,
    },
  });
  const decrementedRequest = buildEmailSendRequestFromAction({
    message: messageWithRecursionRemaining,
    personaSenderAddress: 'persona@example.com',
    payload: {
      to: ['receiver@example.com'],
      subject: 'Reply',
      text: 'Body',
    },
    defaultRecursionDepth: 6,
  });
  decrementedHeaderValue = String(decrementedRequest.headers?.['X-Protege-Recursion'] ?? '');

  const forcedHeaderRequest = buildEmailSendRequestFromAction({
    message: messageWithRecursionRemaining,
    personaSenderAddress: 'persona@example.com',
    payload: {
      to: ['receiver@example.com'],
      subject: 'Reply',
      text: 'Body',
      headers: {
        'X-Protege-Recursion': '999',
      },
    },
    defaultRecursionDepth: 6,
  });
  forcedHeaderStillUsesCalculatedValue = String(forcedHeaderRequest.headers?.['X-Protege-Recursion'] ?? '');
});

describe('gateway outbound recursion header stamping', () => {
  it('uses default recursion depth when inbound metadata does not include recursion remaining', () => {
    expect(defaultHeaderValue).toBe('6');
  });

  it('uses inbound recursion_remaining metadata when present', () => {
    expect(decrementedHeaderValue).toBe('2');
  });

  it('overrides payload recursion header with computed recursion value', () => {
    expect(forcedHeaderStillUsesCalculatedValue).toBe('2');
  });
});
