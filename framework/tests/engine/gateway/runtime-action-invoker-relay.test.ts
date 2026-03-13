import { beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';

let relayMessageIdLength = 0;
let preconfiguredTransportNotRequired = false;

function createRelayInboundMessage(): ReturnType<typeof createInboundMessage> {
  return createInboundMessage({
    personaId: 'persona-relay',
    messageId: '<inbound@example.com>',
    threadId: 'thread-1',
    subject: 'Relay Runtime Action Test',
    text: 'hello',
    to: ['persona@example.com'],
    envelopeRcptTo: ['persona@example.com'],
  });
}

beforeAll(async (): Promise<void> => {
  const relayFrames: Buffer[] = [];
  const invoke = createGatewayRuntimeActionInvoker({
    message: createRelayInboundMessage(),
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    transport: undefined,
    relayClientsByPersonaId: new Map([
      [
        'persona-relay',
        {
          stop: (): void => undefined,
          sendTextMessage: (): void => undefined,
          sendBinaryFrame: (args): void => {
            relayFrames.push(args.frame);
          },
          readStatus: (): { connected: boolean; authenticated: boolean; reconnectAttempt: number } => ({
            connected: true,
            authenticated: true,
            reconnectAttempt: 0,
          }),
        },
      ],
    ]),
    personaSenderAddress: 'persona@example.com',
  });

  const result = await invoke({
    action: 'email.send',
    payload: {
      to: ['receiver@example.com'],
      subject: 'Relay Tool Reply',
      body: 'hello from relay runtime action',
    },
  });
  relayMessageIdLength = String(result.messageId ?? '').length;
  preconfiguredTransportNotRequired = relayFrames.length >= 3;
});

describe('gateway runtime action invoker relay fallback', () => {
  it('sends email.send via relay client when smtp transport is unavailable', () => {
    expect(preconfiguredTransportNotRequired).toBe(true);
  });

  it('returns non-empty message id for relay-backed email.send actions', () => {
    expect(relayMessageIdLength > 0).toBe(true);
  });
});
