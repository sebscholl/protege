import { beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayRuntimeActionInvoker,
  runWebFetchRuntimeAction,
} from '@engine/gateway/index';
import { mswIntercept } from '@tests/network/index';

let htmlStatus = -1;
let htmlTitle = '';
let htmlText = '';
let plainText = '';
let redirectedUrl = '';
let truncatedText = '';
let truncatedFlag = false;
let statusError = '';
let unsupportedContentError = '';
let timeoutError = '';
let invokerStatus = -1;

beforeAll(async (): Promise<void> => {
  mswIntercept({ fixtureKey: 'web/fetch/200-html' });
  const htmlResult = await runWebFetchRuntimeAction({
    payload: {
      url: 'https://fixtures.local/success.html',
      timeoutMs: 200,
    },
  });
  htmlStatus = Number(htmlResult.status ?? -1);
  htmlTitle = String(htmlResult.title ?? '');
  htmlText = String(htmlResult.text ?? '');

  mswIntercept({ fixtureKey: 'web/fetch/200-text' });
  const textResult = await runWebFetchRuntimeAction({
    payload: {
      url: 'https://fixtures.local/success.txt',
      timeoutMs: 200,
    },
  });
  plainText = String(textResult.text ?? '');

  mswIntercept({ fixtureKey: 'web/fetch/302-redirect' });
  mswIntercept({ fixtureKey: 'web/fetch/200-redirect-target' });
  const redirectResult = await runWebFetchRuntimeAction({
    payload: {
      url: 'https://fixtures.local/redirect',
      timeoutMs: 200,
    },
  });
  redirectedUrl = String(redirectResult.url ?? '');

  mswIntercept({ fixtureKey: 'web/fetch/200-text' });
  const truncatedResult = await runWebFetchRuntimeAction({
    payload: {
      url: 'https://fixtures.local/success.txt',
      maxBytes: 12,
      timeoutMs: 200,
    },
  });
  truncatedText = String(truncatedResult.text ?? '');
  truncatedFlag = Boolean(truncatedResult.truncated);

  mswIntercept({ fixtureKey: 'web/fetch/408-timeout' });
  try {
    await runWebFetchRuntimeAction({
      payload: {
        url: 'https://fixtures.local/timeout',
        timeoutMs: 200,
      },
    });
  } catch (error) {
    statusError = (error as Error).message;
  }

  mswIntercept({
    fixtureKey: 'web/fetch/200-text',
    merge: {
      response: {
        headers: {
          'content-type': 'image/png',
        },
      },
    },
  });
  try {
    await runWebFetchRuntimeAction({
      payload: {
        url: 'https://fixtures.local/success.txt',
        timeoutMs: 200,
      },
    });
  } catch (error) {
    unsupportedContentError = (error as Error).message;
  }

  try {
    await runWebFetchRuntimeAction({
      payload: {
        url: 'https://fixtures.local/slow',
        timeoutMs: 1,
      },
      fetchFn: async (
        _input: URL | RequestInfo,
        init?: RequestInit,
      ): Promise<Response> => {
        return new Promise((_, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
    });
  } catch (error) {
    timeoutError = (error as Error).message;
  }

  const invoke = createGatewayRuntimeActionInvoker({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'agent@example.com' }],
      subject: 'Hello',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
  });
  mswIntercept({ fixtureKey: 'web/fetch/200-text' });
  const invokerResult = await invoke({
    action: 'web.fetch',
    payload: {
      url: 'https://fixtures.local/success.txt',
      timeoutMs: 200,
    },
  });
  invokerStatus = Number(invokerResult.status ?? -1);
});

describe('gateway runtime action invoker web.fetch action', () => {
  it('returns 200 status for HTML fetches', () => {
    expect(htmlStatus).toBe(200);
  });

  it('extracts html title from fetched pages', () => {
    expect(htmlTitle).toBe('Fixture HTML');
  });

  it('extracts readable html body text', () => {
    expect(htmlText.includes('Web fetch fixture page.')).toBe(true);
  });

  it('returns plain text content for text payloads', () => {
    expect(plainText.includes('Plain fixture content')).toBe(true);
  });

  it('follows redirects and returns final URL', () => {
    expect(redirectedUrl).toBe('https://fixtures.local/redirect-target.txt');
  });

  it('sets truncation when maxBytes caps fetched content', () => {
    expect(truncatedFlag).toBe(true);
  });

  it('caps text output when maxBytes is applied', () => {
    expect(truncatedText.length <= 12).toBe(true);
  });

  it('fails on non-success upstream status codes', () => {
    expect(statusError.includes('status 408')).toBe(true);
  });

  it('fails on non-text content-types', () => {
    expect(unsupportedContentError.includes('content-type')).toBe(true);
  });

  it('fails with timeout error when fetch exceeds timeout', () => {
    expect(timeoutError.includes('timed out')).toBe(true);
  });

  it('supports web.fetch through gateway runtime action invoker', () => {
    expect(invokerStatus).toBe(200);
  });
});
