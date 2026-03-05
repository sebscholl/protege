import { existsSync, writeFileSync } from 'node:fs';
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
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { loadNetworkFixture } from '@tests/network/index';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let missingPersonaRejected = false;
let missingPersonaTemporalDbCreated = true;
let relayToolFailureRaised = false;
let relayToolFailureLogFound = false;
let workspace = undefined as ReturnType<typeof createTestWorkspaceFromFixture> | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-relay-failures-',
    symlinkExtensionsFromRepo: true,
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;
  process.env.OPENAI_API_KEY = 'test-key';

  const knownPersona = createPersona({});
  workspace.patchConfigFiles({
    'context.json': {
      thread: ['thread-history', 'current-input'],
      responsibility: ['current-input'],
    },
  });

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
      mailDomain: 'localhost',
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
      mailDomain: 'localhost',
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
  workspace?.cleanup();
  process.chdir(previousCwd);
  delete process.env.OPENAI_API_KEY;
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
