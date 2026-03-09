import { beforeAll, describe, expect, it } from 'vitest';

import { applyRelayTunnelFrame, createRelayTunnelAssemblyState } from '@engine/gateway/relay-tunnel';

let completedCount = 0;
let completedMailFrom = '';
let completedRcptTo = '';
let completedPayload = '';
let chunkWithoutStartIgnored = false;
let endWithoutStartIgnored = false;
let restartResetsPreviousChunks = false;

beforeAll((): void => {
  const state = createRelayTunnelAssemblyState();
  completedCount = 0;
  applyRelayTunnelFrame({
    state,
    frame: {
      type: 'smtp_start',
      streamId: 'stream-1',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@relay-protege-mail.com',
    },
    onCompleted: (args): void => {
      completedCount += 1;
      completedMailFrom = args.mailFrom;
      completedRcptTo = args.rcptTo;
      completedPayload = args.rawMimeBuffer.toString('utf8');
    },
  });
  applyRelayTunnelFrame({
    state,
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-1',
      chunk: Buffer.from('hello ', 'utf8'),
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state,
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-1',
      chunk: Buffer.from('world', 'utf8'),
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state,
    frame: {
      type: 'smtp_end',
      streamId: 'stream-1',
    },
    onCompleted: (args): void => {
      completedCount += 1;
      completedMailFrom = args.mailFrom;
      completedRcptTo = args.rcptTo;
      completedPayload = args.rawMimeBuffer.toString('utf8');
    },
  });

  const chunkWithoutStartState = createRelayTunnelAssemblyState();
  let chunkWithoutStartCount = 0;
  applyRelayTunnelFrame({
    state: chunkWithoutStartState,
    frame: {
      type: 'smtp_chunk',
      streamId: 'missing',
      chunk: Buffer.from('ignored', 'utf8'),
    },
    onCompleted: (): void => {
      chunkWithoutStartCount += 1;
    },
  });
  chunkWithoutStartIgnored = chunkWithoutStartCount === 0;

  const endWithoutStartState = createRelayTunnelAssemblyState();
  let endWithoutStartCount = 0;
  applyRelayTunnelFrame({
    state: endWithoutStartState,
    frame: {
      type: 'smtp_end',
      streamId: 'missing',
    },
    onCompleted: (): void => {
      endWithoutStartCount += 1;
    },
  });
  endWithoutStartIgnored = endWithoutStartCount === 0;

  const restartState = createRelayTunnelAssemblyState();
  let restartPayload = '';
  applyRelayTunnelFrame({
    state: restartState,
    frame: {
      type: 'smtp_start',
      streamId: 'stream-restart',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@relay-protege-mail.com',
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state: restartState,
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-restart',
      chunk: Buffer.from('old', 'utf8'),
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state: restartState,
    frame: {
      type: 'smtp_start',
      streamId: 'stream-restart',
      mailFrom: 'sender@example.com',
      rcptTo: 'persona@relay-protege-mail.com',
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state: restartState,
    frame: {
      type: 'smtp_chunk',
      streamId: 'stream-restart',
      chunk: Buffer.from('new', 'utf8'),
    },
    onCompleted: (): void => undefined,
  });
  applyRelayTunnelFrame({
    state: restartState,
    frame: {
      type: 'smtp_end',
      streamId: 'stream-restart',
    },
    onCompleted: (args): void => {
      restartPayload = args.rawMimeBuffer.toString('utf8');
    },
  });
  restartResetsPreviousChunks = restartPayload === 'new';
});

describe('gateway relay tunnel frame assembly', () => {
  it('completes one assembled stream after smtp_end', () => {
    expect(completedCount).toBe(1);
  });

  it('keeps sender metadata across assembled streams', () => {
    expect(completedMailFrom).toBe('sender@example.com');
  });

  it('keeps recipient metadata across assembled streams', () => {
    expect(completedRcptTo).toBe('persona@relay-protege-mail.com');
  });

  it('concatenates smtp_chunk frame bytes into one raw mime payload', () => {
    expect(completedPayload).toBe('hello world');
  });

  it('ignores smtp_chunk frames received before smtp_start', () => {
    expect(chunkWithoutStartIgnored).toBe(true);
  });

  it('ignores smtp_end frames received before smtp_start', () => {
    expect(endWithoutStartIgnored).toBe(true);
  });

  it('resets prior in-flight chunks when smtp_start repeats same stream id', () => {
    expect(restartResetsPreviousChunks).toBe(true);
  });
});
