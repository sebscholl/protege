import { beforeAll, describe, expect, it } from 'vitest';

import {
  createRelaySmtpChunkFrame,
  createRelaySmtpEndFrame,
  createRelaySmtpStartFrame,
  parseRelayTunnelFrame,
} from '@relay/src/tunnel';

let parsedStartType = '';
let parsedStartStreamId = '';
let parsedStartMailFrom = '';
let parsedStartRcptTo = '';
let parsedChunkType = '';
let parsedChunkPayload = '';
let parsedEndType = '';
let invalidVersionUndefined = false;
let invalidLengthUndefined = false;
let invalidStartBodyUndefined = false;
let unknownTypeUndefined = false;

beforeAll((): void => {
  const startFrame = createRelaySmtpStartFrame({
    streamId: 'stream-1',
    mailFrom: 'sender@example.com',
    rcptTo: 'recipient@example.com',
  });
  const parsedStart = parseRelayTunnelFrame({
    payload: startFrame,
  });
  parsedStartType = parsedStart?.type ?? '';
  parsedStartStreamId = parsedStart?.streamId ?? '';
  parsedStartMailFrom = parsedStart && parsedStart.type === 'smtp_start' ? parsedStart.mailFrom : '';
  parsedStartRcptTo = parsedStart && parsedStart.type === 'smtp_start' ? parsedStart.rcptTo : '';

  const chunkFrame = createRelaySmtpChunkFrame({
    streamId: 'stream-1',
    chunk: Buffer.from('hello', 'utf8'),
  });
  const parsedChunk = parseRelayTunnelFrame({
    payload: chunkFrame,
  });
  parsedChunkType = parsedChunk?.type ?? '';
  parsedChunkPayload = parsedChunk && parsedChunk.type === 'smtp_chunk'
    ? parsedChunk.chunk.toString('utf8')
    : '';

  const endFrame = createRelaySmtpEndFrame({
    streamId: 'stream-1',
  });
  parsedEndType = parseRelayTunnelFrame({
    payload: endFrame,
  })?.type ?? '';

  const invalidVersionFrame = Buffer.from(startFrame);
  invalidVersionFrame.writeUInt8(2, 0);
  invalidVersionUndefined = parseRelayTunnelFrame({
    payload: invalidVersionFrame,
  }) === undefined;

  const invalidLengthFrame = Buffer.from(startFrame.subarray(0, startFrame.length - 1));
  invalidLengthUndefined = parseRelayTunnelFrame({
    payload: invalidLengthFrame,
  }) === undefined;

  const invalidStartBody = Buffer.from(startFrame);
  const streamIdLength = invalidStartBody.readUInt8(2);
  const bodyOffset = 7 + streamIdLength;
  invalidStartBody.writeUInt8(0, bodyOffset);
  invalidStartBodyUndefined = parseRelayTunnelFrame({
    payload: invalidStartBody,
  }) === undefined;

  const unknownTypeFrame = Buffer.from(startFrame);
  unknownTypeFrame.writeUInt8(99, 1);
  unknownTypeUndefined = parseRelayTunnelFrame({
    payload: unknownTypeFrame,
  }) === undefined;
});

describe('relay tunnel frame encoding', () => {
  it('parses smtp_start frames', () => {
    expect(parsedStartType).toBe('smtp_start');
  });

  it('keeps smtp_start stream id', () => {
    expect(parsedStartStreamId).toBe('stream-1');
  });

  it('keeps smtp_start mailFrom metadata', () => {
    expect(parsedStartMailFrom).toBe('sender@example.com');
  });

  it('keeps smtp_start rcptTo metadata', () => {
    expect(parsedStartRcptTo).toBe('recipient@example.com');
  });

  it('parses smtp_chunk frames', () => {
    expect(parsedChunkType).toBe('smtp_chunk');
  });

  it('keeps smtp_chunk payload bytes', () => {
    expect(parsedChunkPayload).toBe('hello');
  });

  it('parses smtp_end frames', () => {
    expect(parsedEndType).toBe('smtp_end');
  });

  it('rejects unsupported tunnel versions', () => {
    expect(invalidVersionUndefined).toBe(true);
  });

  it('rejects truncated tunnel frames', () => {
    expect(invalidLengthUndefined).toBe(true);
  });

  it('rejects invalid smtp_start metadata payloads', () => {
    expect(invalidStartBodyUndefined).toBe(true);
  });

  it('rejects unknown tunnel frame types', () => {
    expect(unknownTypeUndefined).toBe(true);
  });
});
