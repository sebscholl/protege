import { beforeAll, describe, expect, it } from 'vitest';

import { createRelayRuntimeState, sendRelayDeliveryControlMessage } from '@relay/src/index';
import { activateRelaySession } from '@relay/src/session-registry';

let sentPayload = '';
let missingSessionDidThrow = false;

beforeAll((): void => {
  const runtimeState = createRelayRuntimeState();
  activateRelaySession({
    registry: runtimeState.sessionRegistry,
    publicKeyBase32: 'test-pubkey',
    sessionRole: 'inbound',
    socket: {
      id: 'socket-1',
      send: (
        payload: string | Buffer,
      ): void => {
        sentPayload = typeof payload === 'string' ? payload : payload.toString('utf8');
      },
      close: (): void => undefined,
    },
    nowIso: '2026-02-26T00:00:00.000Z',
  });

  sendRelayDeliveryControlMessage({
    runtimeState,
    socketId: 'socket-1',
    payload: {
      type: 'relay_delivery_result',
      streamId: 'stream-1',
      status: 'sent',
    },
  });

  try {
    sendRelayDeliveryControlMessage({
      runtimeState,
      socketId: 'missing-socket',
      payload: {
        type: 'relay_delivery_result',
        streamId: 'stream-2',
        status: 'failed',
        error: 'mx_rejected',
      },
    });
  } catch {
    missingSessionDidThrow = true;
  }
});

describe('relay delivery control signaling', () => {
  it('sends delivery control payload to the originating websocket session', () => {
    expect(sentPayload.includes('relay_delivery_result')).toBe(true);
  });

  it('does not throw when socket session is missing', () => {
    expect(missingSessionDidThrow).toBe(false);
  });
});
