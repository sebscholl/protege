import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayInboundProcessingConfig,
  ingestRelayInboundMime,
} from '@engine/gateway/index';
import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { createUnifiedLogger } from '@engine/shared/logger';
import { createPersona } from '@engine/shared/personas';
import { toJsonRecord } from '@tests/helpers/json';
import { waitForCondition } from '@tests/helpers/async';
import { loadNetworkFixture } from '@tests/network/index';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let outboundRelayFrameTypes: string[] = [];
let outboundRelayChunkContainsToolBody = false;
let temporalInboundCount = 0;
let temporalOutboundCount = 0;
let correlatedLogFound = false;
let correlationIdPropagated = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-e2e-relay-roundtrip-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas'), { recursive: true });
  symlinkSync(join(previousCwd, 'extensions'), join(tempRootPath, 'extensions'));

  const persona = createPersona({});
  writeFileSync(join(tempRootPath, 'config', 'inference.json'), JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    recursion_depth: 3,
    providers: {
      openai: {
        api_key: 'test-key',
      },
    },
  }));
  writeFileSync(join(tempRootPath, 'config', 'system-prompt.md'), 'You are Protege.');
  writeFileSync(join(tempRootPath, 'config', 'system.json'), JSON.stringify({
    logs_dir_path: join(tempRootPath, 'tmp', 'logs'),
    console_log_format: 'json',
  }));

  const firstResponseFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200-tool-call',
  }).response.body;
  const secondResponseFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200',
  }).response.body;
  let providerCallCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      const payload = providerCallCount === 0 ? firstResponseFixture : secondResponseFixture;
      providerCallCount += 1;
      return HttpResponse.json(toJsonRecord({
        value: payload,
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));

  const relayFrames: Buffer[] = [];
  const relayClientsByPersonaId = new Map([
    [
      persona.personaId,
      {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (
          args: {
            frame: Buffer;
          },
        ): void => {
          relayFrames.push(args.frame);
        },
        readStatus: (): {
          connected: boolean;
          authenticated: boolean;
          reconnectAttempt: number;
        } => ({
          connected: true,
          authenticated: true,
          reconnectAttempt: 0,
        }),
      },
    ],
  ]);

  const logger = createUnifiedLogger({
    logsDirPath: join(tempRootPath, 'tmp', 'logs'),
    scope: 'gateway',
    consoleLogFormat: 'json',
  });
  const inboundConfig = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'localhost',
    },
    logger,
    relayClientsByPersonaId,
  });

  await ingestRelayInboundMime({
    inboundConfig,
    recipientAddress: `${persona.publicKeyBase32}@relay-protege-mail.com`,
    mailFrom: 'sender@example.com',
    rawMimeBuffer: Buffer.from(
      'From: sender@example.com\r\n'
      + `To: ${persona.publicKeyBase32}@relay-protege-mail.com\r\n`
      + 'Subject: Relay E2E Test\r\n'
      + 'Message-ID: <relay-e2e-inbound@example.com>\r\n'
      + '\r\n'
      + 'Please use send_email to answer me.\r\n',
      'utf8',
    ),
  });

  await waitForCondition({
    timeoutMs: 5_000,
    intervalMs: 25,
    predicate: (): boolean => relayFrames.length >= 3,
    timeoutMessage: 'Timed out waiting for e2e relay roundtrip condition.',
  });

  outboundRelayFrameTypes = relayFrames.map((frame): string => {
    return parseRelayTunnelFrame({
      payload: frame,
    })?.type ?? 'unknown';
  });
  outboundRelayChunkContainsToolBody = relayFrames.some((frame): boolean => {
    const parsed = parseRelayTunnelFrame({
      payload: frame,
    });
    return parsed?.type === 'smtp_chunk'
      && parsed.chunk.toString('utf8').includes('Tool Body');
  });

  const temporalDbPath = join(tempRootPath, 'memory', persona.personaId, 'temporal.db');
  const db = new Database(temporalDbPath, { readonly: true });
  temporalInboundCount = (db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE direction = 'inbound'",
  ).get() as { count: number }).count;
  temporalOutboundCount = (db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'",
  ).get() as { count: number }).count;
  db.close();

  const logLines = readFileSync(join(tempRootPath, 'tmp', 'logs', 'protege.log'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const inboundEvent = logLines.find((line) => line.event === 'gateway.inbound.received');
  const completionEvent = logLines.find((line) => line.event === 'harness.inference.completed');
  const toolCallEvent = logLines.find((line) => line.event === 'harness.tool.call.started');
  correlatedLogFound = Boolean(
    inboundEvent
    && completionEvent
    && typeof inboundEvent.personaId === 'string'
    && typeof inboundEvent.threadId === 'string'
    && typeof inboundEvent.messageId === 'string'
    && completionEvent.personaId === inboundEvent.personaId
    && completionEvent.threadId === inboundEvent.threadId
    && completionEvent.messageId === inboundEvent.messageId,
  );
  correlationIdPropagated = Boolean(
    inboundEvent
    && completionEvent
    && toolCallEvent
    && typeof inboundEvent.correlationId === 'string'
    && completionEvent.correlationId === inboundEvent.correlationId
    && toolCallEvent.correlationId === inboundEvent.correlationId,
  );
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('relay roundtrip e2e', () => {
  it('persists inbound relay-ingested messages into persona temporal storage', () => {
    expect(temporalInboundCount).toBe(1);
  });

  it('persists outbound harness messages after tool-driven relay delivery', () => {
    expect(temporalOutboundCount).toBe(1);
  });

  it('sends relay outbound tunnel frames with start/chunk/end types', () => {
    expect([
      outboundRelayFrameTypes.includes('smtp_start'),
      outboundRelayFrameTypes.includes('smtp_chunk'),
      outboundRelayFrameTypes.includes('smtp_end'),
    ]).toEqual([true, true, true]);
  });

  it('includes tool-generated outbound body content in relayed chunk payloads', () => {
    expect(outboundRelayChunkContainsToolBody).toBe(true);
  });

  it('writes correlated log events with personaId threadId and messageId', () => {
    expect(correlatedLogFound).toBe(true);
  });

  it('propagates one correlation id across inbound inference and tool-call events', () => {
    expect(correlationIdPropagated).toBe(true);
  });
});
