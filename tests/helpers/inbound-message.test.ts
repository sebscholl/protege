import { describe, expect, it } from 'vitest';

import { createInboundMessage } from '@tests/helpers/inbound-message';

describe('inbound message helper', () => {
  it('builds normalized address objects for from/to fields', () => {
    expect(createInboundMessage({
      personaId: 'persona-a',
      messageId: '<m1@example.com>',
      threadId: 'thread-a',
      subject: 'Subject',
      text: 'Body',
      from: ['a@example.com'],
      to: ['b@example.com'],
    })).toMatchObject({
      from: [{ address: 'a@example.com' }],
      to: [{ address: 'b@example.com' }],
    });
  });

  it('uses deterministic defaults for envelope recipient and receivedAt fields', () => {
    expect(createInboundMessage({
      personaId: 'persona-a',
      messageId: '<m2@example.com>',
      threadId: 'thread-a',
      subject: 'Subject',
      text: 'Body',
      to: ['agent@example.com'],
    })).toMatchObject({
      envelopeRcptTo: [{ address: 'agent@example.com' }],
      receivedAt: '2026-02-14T00:00:00.000Z',
    });
  });
});
