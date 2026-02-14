import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundForRuntime } from '@engine/gateway/index';
import { loadNetworkFixture } from '@tests/network/index';
import { networkServer } from '@tests/network/server';

let tempRootPath = '';
let previousCwd = '';
let noToolRunFailed = false;
let noToolOutboundMessageCount = 0;
let toolRunErrorMessage = '';
let noToolTemporalDbPath = '';

/**
 * Converts unknown fixture response bodies into JSON-safe record payloads.
 */
function toJsonRecord(
  args: {
    value: unknown;
  },
): Record<string, unknown> {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return {};
  }

  return args.value as Record<string, unknown>;
}

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-tool-driven-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });
  mkdirSync(join(tempRootPath, 'personas', 'persona-tool-driven'), { recursive: true });
  symlinkSync(join(previousCwd, 'extensions'), join(tempRootPath, 'extensions'));

  writeFileSync(join(tempRootPath, 'personas', 'persona-tool-driven', 'persona.json'), JSON.stringify({
    personaId: 'persona-tool-driven',
    publicKeyBase32: 'fixture',
    emailLocalPart: 'fixture',
    createdAt: '2026-02-14T00:00:00.000Z',
  }));
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

  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      return HttpResponse.json(toJsonRecord({
        value: loadNetworkFixture({
        fixtureKey: 'openai/chat-completions/200',
      }).response.body,
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));
  try {
    await handleInboundForRuntime({
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
      message: {
        personaId: 'persona-tool-driven',
        messageId: '<tool-driven-inbound-1@example.com>',
        threadId: 'tool-driven-thread-1',
        from: [{ address: 'sender@example.com' }],
        to: [{ address: 'agent@example.com' }],
        cc: [],
        bcc: [],
        envelopeRcptTo: [{ address: 'agent@example.com' }],
        subject: 'No tool call',
        text: 'Return plain text only.',
        references: [],
        receivedAt: '2026-02-14T00:00:00.000Z',
        rawMimePath: '/tmp/inbound-1.eml',
        attachments: [],
      },
      transport: undefined,
      defaultFromAddress: 'protege@localhost',
    });
  } catch {
    noToolRunFailed = true;
  }

  noToolTemporalDbPath = join(tempRootPath, 'memory', 'persona-tool-driven', 'temporal.db');
  if (existsSync(noToolTemporalDbPath)) {
    const db = new Database(noToolTemporalDbPath, { readonly: true });
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'",
    ).get() as { count: number };
    noToolOutboundMessageCount = row.count;
    db.close();
  }

  const toolCallFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200-tool-call',
  }).response.body;
  const finalFixture = loadNetworkFixture({
    fixtureKey: 'openai/chat-completions/200',
  }).response.body;
  let toolScenarioCallCount = 0;
  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => {
      const body = toolScenarioCallCount === 0 ? toolCallFixture : finalFixture;
      toolScenarioCallCount += 1;
      return HttpResponse.json(toJsonRecord({ value: body }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  ));
  try {
    await handleInboundForRuntime({
      logger: {
        info: (): void => undefined,
        error: (): void => undefined,
      },
      message: {
        personaId: 'persona-tool-driven',
        messageId: '<tool-driven-inbound-2@example.com>',
        threadId: 'tool-driven-thread-2',
        from: [{ address: 'sender@example.com' }],
        to: [{ address: 'agent@example.com' }],
        cc: [],
        bcc: [],
        envelopeRcptTo: [{ address: 'agent@example.com' }],
        subject: 'Tool call',
        text: 'Use the send_email tool.',
        references: [],
        receivedAt: '2026-02-14T00:01:00.000Z',
        rawMimePath: '/tmp/inbound-2.eml',
        attachments: [],
      },
      transport: undefined,
      defaultFromAddress: 'protege@localhost',
    });
  } catch (error) {
    toolRunErrorMessage = (error as Error).message;
  }
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway inbound handling is tool-driven for outbound delivery', () => {
  it('does not fail when no tool action is invoked and transport is missing', () => {
    expect(noToolRunFailed).toBe(false);
  });

  it('persists outbound harness content for non-tool responses without smtp transport', () => {
    expect(noToolOutboundMessageCount).toBe(1);
  });

  it('fails tool-driven runs when email.send is invoked without smtp transport', () => {
    expect(toolRunErrorMessage.includes('Outbound transport is not configured for email.send.')).toBe(true);
  });

  it('creates persona temporal storage while running without implicit outbound smtp send', () => {
    expect(existsSync(noToolTemporalDbPath)).toBe(true);
  });
});
