import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createRelayRequestHandler,
  createRelayRuntimeState,
  createRelayUpgradeHandler,
} from '@relay/src/index';

type UpgradeCapture = {
  called: boolean;
  upgradedSocketMessageCount: number;
  destroyed: boolean;
};

let healthStatusCode = 0;
let healthStatusValue = '';
let notFoundStatusCode = 0;
let notFoundValue = '';
let wsUpgradeCalled = false;
let wsUpgradeSentChallenge = false;
let missingUpgradeDestroyed = false;
let missingUpgradeCalled = true;

/**
 * Invokes one relay HTTP request handler with lightweight request/response doubles.
 */
function invokeHandler(
  args: {
    method: string;
    url: string;
  },
): {
  statusCode: number;
  body: string;
} {
  const request = {
    method: args.method,
    url: args.url,
  } as IncomingMessage;
  const responseState = {
    statusCode: 200,
    body: '',
  };
  const response = {
    setHeader: (): void => undefined,
    end: (value?: string): void => {
      responseState.body = value ?? '';
    },
    get statusCode(): number {
      return responseState.statusCode;
    },
    set statusCode(value: number) {
      responseState.statusCode = value;
    },
  } as unknown as ServerResponse;
  createRelayRequestHandler()(request, response);
  return responseState;
}

/**
 * Executes one relay upgrade handler invocation and captures side effects.
 */
function invokeUpgrade(
  args: {
    path: string;
  },
): UpgradeCapture {
  const listeners: Record<string, ((payload?: unknown) => void)[]> = {
    message: [],
    close: [],
  };
  const sentMessages: string[] = [];
  const runtime = createRelayRuntimeState();
  let handleUpgradeCalled = false;
  const request = {
    url: args.path,
  } as IncomingMessage;
  const socketState = {
    destroyed: false,
  };
  const socket = {
    destroy: (): void => {
      socketState.destroyed = true;
    },
  } as unknown as Duplex;
  const webSocketServer = {
    handleUpgrade: (
      _request: IncomingMessage,
      _socket: Duplex,
      _head: Buffer,
      callback: (ws: {
        send: (payload: string) => void;
        close: (
          code: number,
          reason: string,
        ) => void;
        on: (
          event: 'message' | 'close',
          listener: (payload?: unknown) => void,
        ) => void;
      }) => void,
    ): void => {
      handleUpgradeCalled = true;
      callback({
        send: (payload: string): void => {
          sentMessages.push(payload);
        },
        close: (): void => undefined,
        on: (
          event: 'message' | 'close',
          listener: (payload?: unknown) => void,
        ): void => {
          listeners[event].push(listener);
        },
      });
    },
  };
  const handler = createRelayUpgradeHandler({
    webSocketServer,
    runtimeState: runtime,
    nowIso: (): string => '2026-02-14T00:00:00.000Z',
  });
  handler(request, socket, Buffer.alloc(0));
  for (const listener of listeners.message) {
    listener(JSON.stringify({
      type: 'auth_challenge_request',
      publicKeyBase32: 'abcd',
    }));
  }

  return {
    called: handleUpgradeCalled,
    upgradedSocketMessageCount: sentMessages.length,
    destroyed: socketState.destroyed,
  };
}

beforeAll((): void => {
  const health = invokeHandler({
    method: 'GET',
    url: '/health',
  });
  healthStatusCode = health.statusCode;
  healthStatusValue = (JSON.parse(health.body) as { status?: string }).status ?? '';

  const notFound = invokeHandler({
    method: 'GET',
    url: '/missing',
  });
  notFoundStatusCode = notFound.statusCode;
  notFoundValue = (JSON.parse(notFound.body) as { error?: string }).error ?? '';

  const wsUpgrade = invokeUpgrade({
    path: '/ws',
  });
  wsUpgradeCalled = wsUpgrade.called;
  wsUpgradeSentChallenge = wsUpgrade.upgradedSocketMessageCount > 0;

  const missingUpgrade = invokeUpgrade({
    path: '/missing',
  });
  missingUpgradeDestroyed = missingUpgrade.destroyed;
  missingUpgradeCalled = missingUpgrade.called;
});

describe('relay request handling', () => {
  it('returns 200 for health endpoint requests', () => {
    expect(healthStatusCode).toBe(200);
  });

  it('returns ok status payload from health endpoint', () => {
    expect(healthStatusValue).toBe('ok');
  });

  it('returns 404 for unknown routes', () => {
    expect(notFoundStatusCode).toBe(404);
  });

  it('returns not_found payload for unknown routes', () => {
    expect(notFoundValue).toBe('not_found');
  });
});

describe('relay websocket upgrade handling', () => {
  it('invokes websocket upgrade flow for /ws requests', () => {
    expect(wsUpgradeCalled).toBe(true);
  });

  it('binds websocket auth listeners after upgrade and sends challenge responses', () => {
    expect(wsUpgradeSentChallenge).toBe(true);
  });

  it('destroys sockets for non-/ws upgrade paths', () => {
    expect(missingUpgradeDestroyed).toBe(true);
  });

  it('skips websocket upgrade flow for non-/ws paths', () => {
    expect(missingUpgradeCalled).toBe(false);
  });
});
