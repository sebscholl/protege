import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayInboundProcessingConfig,
  handleInboundForRuntime,
  ingestRelayInboundMime,
} from '@engine/gateway/index';
import { persistInboundMessageForRuntime } from '@engine/harness/runtime';
import { createPersona } from '@engine/shared/personas';
import { toJsonRecord } from '@tests/helpers/json';
import { loadNetworkFixture } from '@tests/network/index';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let missingPersonaRejected = false;
let missingPersonaTemporalDbCreated = true;
let relayToolFailureRaised = false;
let relayToolFailureLogFound = false;

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-e2e-relay-failures-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas'), { recursive: true });
  symlinkSync(join(previousCwd, 'extensions'), join(tempRootPath, 'extensions'));

  const knownPersona = createPersona({
    setActive: true,
  });
  writeFileSync(join(tempRootPath, 'config', 'inference.json'), JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    recursion_depth: 3,
    whitelist: ['*@example.com'],
    providers: {
      openai: {
        api_key: 'test-key',
      },
    },
  }));
  writeFileSync(join(tempRootPath, 'config', 'system-prompt.md'), 'You are Protege.');

  const eventLog: Array<{ event: string; context: Record<string, unknown> }> = [];
  const logger = {
    info: (
      args: {
        event: string;
        context: Record<string, unknown>;
      },
    ): void => {
      eventLog.push(args);
    },
    error: (
      args: {
        event: string;
        context: Record<string, unknown>;
      },
    ): void => {
      eventLog.push(args);
    },
  };

  const inboundConfig = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      defaultFromAddress: 'protege@localhost',
    },
    logger,
  });

  try {
    await ingestRelayInboundMime({
      inboundConfig,
      recipientAddress: 'unknown-persona@relay-protege-mail.com',
      mailFrom: 'sender@example.com',
      rawMimeBuffer: Buffer.from(
        'From: sender@example.com\r\n'
        + 'To: unknown-persona@relay-protege-mail.com\r\n'
        + 'Subject: Relay Unknown Persona\r\n'
        + 'Message-ID: <relay-unknown-persona@example.com>\r\n'
        + '\r\n'
        + 'This should be rejected.\r\n',
        'utf8',
      ),
    });
  } catch {
    missingPersonaRejected = true;
  }
  missingPersonaTemporalDbCreated = existsSync(join(tempRootPath, 'memory', 'unknown-persona', 'temporal.db'));

  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      return HttpResponse.json(toJsonRecord({
        value: loadNetworkFixture({
          fixtureKey: 'openai/chat-completions/200-tool-call',
        }).response.body,
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));
  const message = {
    personaId: knownPersona.personaId,
    messageId: '<relay-tool-failure-inbound@example.com>',
    threadId: 'relay-tool-failure-thread',
    from: [{ address: 'sender@example.com' }],
    to: [{ address: `${knownPersona.publicKeyBase32}@relay-protege-mail.com` }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: `${knownPersona.publicKeyBase32}@relay-protege-mail.com` }],
    subject: 'Relay Tool Failure',
    text: 'Use send_email.',
    references: [],
    receivedAt: '2026-02-14T00:00:00.000Z',
    rawMimePath: '/tmp/inbound-relay-tool-failure.eml',
    attachments: [],
  };
  persistInboundMessageForRuntime({
    message,
    logger,
    correlationId: 'test-correlation',
  });
  try {
    await handleInboundForRuntime({
      logger,
      message,
      relayClientsByPersonaId: new Map([
        [
          knownPersona.personaId,
          {
            stop: (): void => undefined,
            sendTextMessage: (): void => undefined,
            sendBinaryFrame: (): void => {
              throw new Error('Relay client cannot send binary frames before authentication.');
            },
            readStatus: (): {
              connected: boolean;
              authenticated: boolean;
              reconnectAttempt: number;
            } => ({
              connected: true,
              authenticated: false,
              reconnectAttempt: 1,
            }),
          },
        ],
      ]),
      defaultFromAddress: 'protege@localhost',
      correlationId: 'test-correlation',
    });
  } catch {
    relayToolFailureRaised = true;
  }
  relayToolFailureLogFound = eventLog.some((entry): boolean => {
    return entry.event === 'harness.tool.call.failed'
      && entry.context.correlationId === 'test-correlation'
      && String(entry.context.message ?? '').includes('before authentication');
  });
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('relay failure paths e2e', () => {
  it('rejects relay inbound payloads that do not resolve to a known persona', () => {
    expect(missingPersonaRejected).toBe(true);
  });

  it('does not create temporal storage for unknown relay recipient identities', () => {
    expect(missingPersonaTemporalDbCreated).toBe(false);
  });

  it('raises runtime failures when relay outbound frames are sent pre-authentication', () => {
    expect(relayToolFailureRaised).toBe(true);
  });

  it('logs failed tool calls with correlation ids for relay outbound failures', () => {
    expect(relayToolFailureLogFound).toBe(true);
  });
});
