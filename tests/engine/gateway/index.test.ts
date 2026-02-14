import { beforeAll, describe, expect, it } from 'vitest';

import { createGatewayInboundProcessingConfig } from '@engine/gateway/index';

let relayClientMapIsPreserved = false;

beforeAll((): void => {
  const relayClientsByPersonaId = new Map<string, {
    stop: () => void;
    sendTextMessage: (
      args: {
        messageJson: string;
      },
    ) => void;
    sendBinaryFrame: (
      args: {
        frame: Buffer;
      },
    ) => void;
    readStatus: () => {
      connected: boolean;
      authenticated: boolean;
      reconnectAttempt: number;
    };
  }>([
    [
      'persona-a',
      {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (): void => undefined,
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: true,
          authenticated: true,
          reconnectAttempt: 0,
        }),
      },
    ],
  ]);

  const config = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      defaultFromAddress: 'protege@localhost',
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    relayClientsByPersonaId,
  });
  relayClientMapIsPreserved = config.relayClientsByPersonaId === relayClientsByPersonaId;
});

describe('gateway inbound config relay wiring', () => {
  it('preserves provided relay client maps for runtime action fallback handling', () => {
    expect(relayClientMapIsPreserved).toBe(true);
  });
});
