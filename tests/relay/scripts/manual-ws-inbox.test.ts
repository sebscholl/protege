import { beforeAll, describe, expect, it } from 'vitest';

import {
  relayWsMessageDataToBuffer,
  resolveRelayWsInboxConfig,
} from '@relay/scripts/manual-ws-inbox';

let defaultUrl = '';
let defaultListenMs = 0;
let customUrl = '';
let customListenMs = 0;
let invalidListenFallbackMs = 0;
let bufferFromArrayBufferLength = 0;
let bufferFromUnsupportedIsUndefined = false;

beforeAll(async (): Promise<void> => {
  const defaultConfig = resolveRelayWsInboxConfig({
    argv: ['node', 'relay/scripts/manual-ws-inbox.ts'],
  });
  defaultUrl = defaultConfig.url;
  defaultListenMs = defaultConfig.listenMs;

  const customConfig = resolveRelayWsInboxConfig({
    argv: ['node', 'relay/scripts/manual-ws-inbox.ts', 'ws://localhost:9090/ws', '45000'],
  });
  customUrl = customConfig.url;
  customListenMs = customConfig.listenMs;

  const invalidConfig = resolveRelayWsInboxConfig({
    argv: ['node', 'relay/scripts/manual-ws-inbox.ts', 'ws://localhost:9090/ws', '-1'],
  });
  invalidListenFallbackMs = invalidConfig.listenMs;

  bufferFromArrayBufferLength = (await relayWsMessageDataToBuffer({
    data: Buffer.from('abc', 'utf8').buffer,
  }))?.length ?? 0;
  bufferFromUnsupportedIsUndefined = (await relayWsMessageDataToBuffer({
    data: '{"type":"auth_ok"}',
  })) === undefined;
});

describe('relay manual websocket inbox config', () => {
  it('uses default relay websocket url when url is omitted', () => {
    expect(defaultUrl).toBe('ws://127.0.0.1:8080/ws');
  });

  it('uses default listen duration when duration is omitted', () => {
    expect(defaultListenMs).toBe(30000);
  });

  it('accepts explicit relay websocket url overrides', () => {
    expect(customUrl).toBe('ws://localhost:9090/ws');
  });

  it('accepts explicit listen duration overrides', () => {
    expect(customListenMs).toBe(45000);
  });

  it('falls back to default listen duration when input is invalid', () => {
    expect(invalidListenFallbackMs).toBe(30000);
  });
});

describe('relay manual websocket inbox binary decoding', () => {
  it('decodes arraybuffer websocket payloads into buffers', () => {
    expect(bufferFromArrayBufferLength > 0).toBe(true);
  });

  it('returns undefined for unsupported binary payload formats', () => {
    expect(bufferFromUnsupportedIsUndefined).toBe(true);
  });
});
