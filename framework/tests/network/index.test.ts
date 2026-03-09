import type { NetworkFixture } from '@tests/network/types';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildUrlRegex,
  loadNetworkFixture,
  mswIntercept,
  resolveFixturePath,
} from '@tests/network/index';

let fixture: NetworkFixture;
let fixturePath: string;
let exactPathRegex: RegExp;
let regexPathRegex: RegExp;
let fetchResponseStatus = 0;
let fetchResponseBody: unknown;

beforeAll(async (): Promise<void> => {
  fixture = loadNetworkFixture({ fixtureKey: 'openai/chat-completions/200' });
  fixturePath = resolveFixturePath({ fixtureKey: 'openai/chat-completions/200' });
  exactPathRegex = buildUrlRegex({
    request: { method: 'POST', path: '/v1/chat/completions' },
  });
  regexPathRegex = buildUrlRegex({
    request: { method: 'POST', pathPattern: '^/v1/chat/completions$' },
  });

  mswIntercept({ fixtureKey: 'openai/chat-completions/200' });
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
  });

  fetchResponseStatus = response.status;
  fetchResponseBody = await response.json();
});

describe('network fixture helpers', () => {
  it('resolves fixture paths under tests/fixtures/api', () => {
    expect(fixturePath.endsWith('tests/fixtures/api/openai/chat-completions/200.json')).toBe(true);
  });

  it('loads fixtures with request metadata', () => {
    expect(fixture.request.method).toBe('POST');
  });

  it('loads fixtures with response metadata', () => {
    expect(fixture.response.status).toBe(200);
  });

  it('builds exact-path regex matchers', () => {
    expect(exactPathRegex.test('https://api.openai.com/v1/chat/completions')).toBe(true);
  });

  it('builds regex-path matchers', () => {
    expect(regexPathRegex.test('https://api.openai.com/v1/chat/completions')).toBe(true);
  });

  it('registers fixture-backed msw intercept handlers', () => {
    expect(fetchResponseStatus).toBe(200);
  });

  it('returns fixture response bodies from intercepted calls', () => {
    expect(fetchResponseBody).toMatchObject({ id: 'chatcmpl_fixture_200' });
  });
});
