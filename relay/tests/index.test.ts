import type { IncomingMessage, ServerResponse } from 'node:http';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createRelayRequestHandler,
} from '@relay/src/index';

let healthStatusCode = 0;
let healthStatusHeader = '';
let healthStatusValue = '';
let notFoundStatusCode = 0;
let notFoundValue = '';

/**
 * Invokes one relay request handler with lightweight request/response doubles.
 */
function invokeHandler(
  args: {
    method: string;
    url: string;
  },
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  const request = {
    method: args.method,
    url: args.url,
  } as IncomingMessage;
  const responseState = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
  };
  const response = {
    setHeader: (
      key: string,
      value: string,
    ): void => {
      responseState.headers[key] = value;
    },
    end: (
      value?: string,
    ): void => {
      responseState.body = value ?? '';
    },
    get statusCode(): number {
      return responseState.statusCode;
    },
    set statusCode(value: number) {
      responseState.statusCode = value;
    },
  } as unknown as ServerResponse;

  const handler = createRelayRequestHandler();
  handler(request, response);
  return responseState;
}

beforeAll((): void => {
  const health = invokeHandler({
    method: 'GET',
    url: '/health',
  });
  healthStatusCode = health.statusCode;
  healthStatusHeader = health.headers['content-type'] ?? '';
  healthStatusValue = (JSON.parse(health.body) as { status?: string }).status ?? '';

  const notFound = invokeHandler({
    method: 'GET',
    url: '/missing',
  });
  notFoundStatusCode = notFound.statusCode;
  notFoundValue = (JSON.parse(notFound.body) as { error?: string }).error ?? '';
});

describe('relay server skeleton', () => {
  it('returns 200 for health endpoint requests', () => {
    expect(healthStatusCode).toBe(200);
  });

  it('returns json content-type for health endpoint requests', () => {
    expect(healthStatusHeader).toBe('application/json');
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
