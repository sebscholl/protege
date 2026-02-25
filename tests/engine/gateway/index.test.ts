import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayInboundProcessingConfig,
  isEmailAddress,
  reconcilePersonaMailboxDomains,
  sendGatewayFailureAlert,
} from '@engine/gateway/index';
import { createPersona, readPersonaMetadata } from '@engine/shared/personas';

let relayClientMapIsPreserved = false;
let localhostAddressValid = false;
let relayDomainReconciled = false;
let gatewayAlertSent = false;
let gatewayAlertSkippedWithoutAdminContact = false;
let tempRootPath = '';
let previousCwd = '';

beforeAll(async (): Promise<void> => {
  previousCwd = process.cwd();
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-gateway-index-'));
  process.chdir(tempRootPath);
  mkdirSync(join(tempRootPath, 'personas'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory'), { recursive: true });

  const relayClientsByPersonaId = new Map<string, {
    stop: () => void;
    sendTextMessage: (
      args: {
        messageJson: string;
      },
    ) => void;
    sendBinaryFrame: (
      args: {
        frame: Buffer;
      },
    ) => void;
    readStatus: () => {
      connected: boolean;
      authenticated: boolean;
      reconnectAttempt: number;
    };
  }>([
    [
      'persona-a',
      {
        stop: (): void => undefined,
        sendTextMessage: (): void => undefined,
        sendBinaryFrame: (): void => undefined,
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

  const config = createGatewayInboundProcessingConfig({
    runtimeConfig: {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'localhost',
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    relayClientsByPersonaId,
  });
  relayClientMapIsPreserved = config.relayClientsByPersonaId === relayClientsByPersonaId;
  localhostAddressValid = isEmailAddress({
    value: 'persona@localhost',
  });

  const persona = createPersona({});
  reconcilePersonaMailboxDomains({
    mailDomain: 'mail.protege.bot',
  });
  relayDomainReconciled = readPersonaMetadata({
    personaId: persona.personaId,
  }).emailAddress.endsWith('@mail.protege.bot');

  let alertInvokeCount = 0;
  await sendGatewayFailureAlert({
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    message: {
      personaId: persona.personaId,
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: persona.emailAddress }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: persona.emailAddress }],
      subject: 'subject',
      text: 'body',
      html: undefined,
      references: [],
      receivedAt: new Date().toISOString(),
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    errorMessage: 'tool failed',
    adminContactEmail: 'ops@example.com',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => {
      alertInvokeCount += 1;
      return {
        messageId: '<alert@example.com>',
      };
    },
  });
  gatewayAlertSent = alertInvokeCount === 1;

  alertInvokeCount = 0;
  await sendGatewayFailureAlert({
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    message: {
      personaId: persona.personaId,
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: persona.emailAddress }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: persona.emailAddress }],
      subject: 'subject',
      text: 'body',
      html: undefined,
      references: [],
      receivedAt: new Date().toISOString(),
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    errorMessage: 'tool failed',
    invokeRuntimeAction: async (): Promise<Record<string, unknown>> => {
      alertInvokeCount += 1;
      return {
        messageId: '<alert@example.com>',
      };
    },
  });
  gatewayAlertSkippedWithoutAdminContact = alertInvokeCount === 0;
});

describe('gateway inbound config relay wiring', () => {
  it('preserves provided relay client maps for runtime action fallback handling', () => {
    expect(relayClientMapIsPreserved).toBe(true);
  });

  it('accepts localhost-domain sender identities for local runtime flows', () => {
    expect(localhostAddressValid).toBe(true);
  });

  it('reconciles persona mailbox domains to configured relay mail domain', () => {
    expect(relayDomainReconciled).toBe(true);
  });

  it('sends gateway failure alerts when admin contact email is configured', () => {
    expect(gatewayAlertSent).toBe(true);
  });

  it('skips gateway failure alerts when admin contact email is absent', () => {
    expect(gatewayAlertSkippedWithoutAdminContact).toBe(true);
  });
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});
