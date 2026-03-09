import type { GatewayLogger } from '@engine/gateway/types';

import { createTransport } from 'nodemailer';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { enqueueInboundProcessing } from '@engine/gateway/index';
import { persistInboundMessageForRuntime } from '@engine/harness/runtime';
import { createPersona } from '@engine/shared/personas';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { scaffoldProviderConfig } from '@tests/helpers/provider';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';
import { networkServer } from '@tests/network/server';

let alertSentCount = 0;
let alertFailedCount = 0;
let alertSkippedCount = 0;
let emailSendInvokeCount = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let providerScaffold!: ReturnType<typeof scaffoldProviderConfig>;

/**
 * Waits until one condition becomes true or throws after timeout.
 */
async function waitForCondition(
  args: {
    condition: () => boolean;
    timeoutMs: number;
  },
): Promise<void> {
  const startedAt = Date.now();
  while (!args.condition()) {
    if (Date.now() - startedAt >= args.timeoutMs) {
      throw new Error('Timed out waiting for gateway failure alert events.');
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  }
}

/**
 * Creates one in-memory logger that tracks gateway alert and runtime email-send events.
 */
function createEventLogger(): GatewayLogger {
  return {
    info: (
      args: {
        event: string;
        context: Record<string, unknown>;
      },
    ): void => {
      if (args.event === 'gateway.alert.sent') {
        alertSentCount += 1;
      }
      if (args.event === 'gateway.runtime_action.invoking' && args.context.action === 'email.send') {
        emailSendInvokeCount += 1;
      }
    },
    error: (
      args: {
        event: string;
      },
    ): void => {
      if (args.event === 'gateway.alert.failed') {
        alertFailedCount += 1;
      }
      if (args.event === 'gateway.alert.skipped_missing_admin_contact' || args.event === 'gateway.alert.skipped_missing_persona') {
        alertSkippedCount += 1;
      }
    },
  };
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-e2e-gateway-alert-reliability-',
    symlinkExtensionsFromRepo: true,
  });
  providerScaffold = scaffoldProviderConfig({
    workspace,
    providerName: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKeyValue: 'test-key',
    patchExtensionsManifest: false,
    writeProviderConfig: false,
  });
  const persona = createPersona({});

  networkServer.use(http.post(
    'https://api.openai.com/v1/chat/completions',
    (): Response => HttpResponse.json({
      error: {
        message: 'forced provider failure',
        type: 'server_error',
      },
    }, {
      status: 500,
      headers: {
        'content-type': 'application/json',
      },
    }),
  ));

  const inboundMessage = createInboundMessage({
    personaId: persona.personaId,
    messageId: '<gateway-failure-alert-e2e@example.com>',
    threadId: 'thread-gateway-failure-alert-e2e',
    subject: 'Trigger provider failure',
    text: 'This should fail and trigger one gateway failure alert.',
    to: [persona.emailAddress],
    envelopeRcptTo: [persona.emailAddress],
    rawMimePath: '/tmp/gateway-failure-alert-e2e.eml',
  });
  persistInboundMessageForRuntime({
    message: inboundMessage,
    logger: createEventLogger(),
    correlationId: 'gateway-alert-e2e',
  });

  enqueueInboundProcessing({
    logger: createEventLogger(),
    message: inboundMessage,
    transport: createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    }),
    mailDomain: 'localhost',
    adminContactEmail: 'alerts@example.com',
    correlationId: 'gateway-alert-e2e',
  });

  await waitForCondition({
    condition: () => alertSentCount === 1 || alertFailedCount > 0 || alertSkippedCount > 0,
    timeoutMs: 5000,
  });
});

afterAll((): void => {
  providerScaffold.restoreEnv();
  workspace.cleanup();
});

describe('gateway failure alert reliability e2e', () => {
  it('sends exactly one alert for one terminal inbound processing failure', () => {
    expect(alertSentCount).toBe(1);
  });

  it('does not emit failed alert events when fallback transport can deliver alerts', () => {
    expect(alertFailedCount).toBe(0);
  });

  it('does not emit skipped alert events when admin contact and persona are available', () => {
    expect(alertSkippedCount).toBe(0);
  });

  it('invokes exactly one runtime email send action for the failure alert path', () => {
    expect(emailSendInvokeCount).toBe(1);
  });
});
