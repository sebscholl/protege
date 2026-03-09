import type { Transporter } from 'nodemailer';

import { describe, expect, it } from 'vitest';

import { createOutboundTransport, sendGatewayReply } from '@engine/gateway/outbound';

let errorEvents = 0;

/**
 * Creates one local transport targeting an unreachable test port.
 */
function createFailingTransport(): Transporter {
  return createOutboundTransport({
    config: {
      host: '127.0.0.1',
      port: 9,
      secure: false,
    },
  });
}

describe('gateway outbound retry behavior', () => {
  it('retries and throws after max attempts are exhausted', async () => {
    await expect(sendGatewayReply({
      transport: createFailingTransport(),
      logger: {
        info: (): void => undefined,
        error: (): void => {
          errorEvents += 1;
        },
      },
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 1,
      },
      request: {
        to: [{ address: 'receiver@example.com' }],
        from: { address: 'protege@localhost' },
        subject: 'Retry Test',
        text: 'body',
        inReplyTo: '<retry@example.com>',
        references: [],
      },
    })).rejects.toBeInstanceOf(Error);
  });

  it('emits one error event per failed attempt', () => {
    expect(errorEvents).toBe(3);
  });
});
