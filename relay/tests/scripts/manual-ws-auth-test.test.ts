import { beforeAll, describe, expect, it } from 'vitest';

import {
  relayWsMessageDataToText,
  resolveRelayWsManualTestConfig,
} from '@relay/scripts/manual-ws-auth-test';

let defaultUrl = '';
let defaultTimeoutMs = 0;
let customUrl = '';
let customTimeoutMs = 0;
let invalidTimeoutFallbackMs = 0;
let messageString = '';
let messageBuffer = '';
let messageArrayBufferContainsValue = false;
let messageUnsupportedIsUndefined = false;

beforeAll(async (): Promise<void> => {
  const defaultConfig = resolveRelayWsManualTestConfig({
    argv: ['node', 'relay/scripts/manual-ws-auth-test.ts'],
  });
  defaultUrl = defaultConfig.url;
  defaultTimeoutMs = defaultConfig.timeoutMs;

  const customConfig = resolveRelayWsManualTestConfig({
    argv: ['node', 'relay/scripts/manual-ws-auth-test.ts', 'ws://localhost:9090/ws', '15000'],
  });
  customUrl = customConfig.url;
  customTimeoutMs = customConfig.timeoutMs;

  const invalidTimeoutConfig = resolveRelayWsManualTestConfig({
    argv: ['node', 'relay/scripts/manual-ws-auth-test.ts', 'ws://localhost:9090/ws', '-5'],
  });
  invalidTimeoutFallbackMs = invalidTimeoutConfig.timeoutMs;

  messageString = (await relayWsMessageDataToText({
    data: '{"ok":true}',
  })) ?? '';
  messageBuffer = (await relayWsMessageDataToText({
    data: Buffer.from('{"ok":true}', 'utf8'),
  })) ?? '';
  messageArrayBufferContainsValue = ((await relayWsMessageDataToText({
    data: Buffer.from('{"ok":true}', 'utf8').buffer,
  })) ?? '').includes('{"ok":true}');
  messageUnsupportedIsUndefined = (await relayWsMessageDataToText({
    data: 123,
  })) === undefined;
});

describe('relay manual websocket auth test config', () => {
  it('uses the default relay websocket url when no explicit url is provided', () => {
    expect(defaultUrl).toBe('ws://127.0.0.1:8080/ws');
  });

  it('uses the default timeout when no explicit timeout is provided', () => {
    expect(defaultTimeoutMs).toBe(10000);
  });

  it('accepts explicit relay websocket url overrides', () => {
    expect(customUrl).toBe('ws://localhost:9090/ws');
  });

  it('accepts explicit timeout overrides', () => {
    expect(customTimeoutMs).toBe(15000);
  });

  it('falls back to default timeout when timeout input is invalid', () => {
    expect(invalidTimeoutFallbackMs).toBe(10000);
  });
});

describe('relay manual websocket auth message decoding', () => {
  it('passes through string payloads unchanged', () => {
    expect(messageString).toBe('{"ok":true}');
  });

  it('decodes buffer payloads into utf8 text', () => {
    expect(messageBuffer).toBe('{"ok":true}');
  });

  it('decodes arraybuffer payloads into utf8 text', () => {
    expect(messageArrayBufferContainsValue).toBe(true);
  });

  it('returns undefined for unsupported payload types', () => {
    expect(messageUnsupportedIsUndefined).toBe(true);
  });
});
