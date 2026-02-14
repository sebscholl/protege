import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';

let unknownActionError = '';
let missingRecipientError = '';
let missingSubjectError = '';
let missingTextError = '';
let emailSendMessageId = '';

beforeAll(async (): Promise<void> => {
  const streamTransport = createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  const invoke = createGatewayRuntimeActionInvoker({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'agent@example.com' }],
      subject: 'Hello',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    transport: streamTransport,
    defaultFromAddress: 'protege@localhost',
  });

  try {
    await invoke({
      action: 'file.write',
      payload: {},
    });
  } catch (error) {
    unknownActionError = (error as Error).message;
  }

  try {
    await invoke({
      action: 'email.send',
      payload: {
        subject: 'Hello',
        text: 'Body',
      },
    });
  } catch (error) {
    missingRecipientError = (error as Error).message;
  }

  try {
    await invoke({
      action: 'email.send',
      payload: {
        to: ['receiver@example.com'],
        text: 'Body',
      },
    });
  } catch (error) {
    missingSubjectError = (error as Error).message;
  }

  try {
    await invoke({
      action: 'email.send',
      payload: {
        to: ['receiver@example.com'],
        subject: 'Hello',
      },
    });
  } catch (error) {
    missingTextError = (error as Error).message;
  }

  const sent = await invoke({
    action: 'email.send',
    payload: {
      to: ['receiver@example.com'],
      subject: 'Tool Subject',
      text: 'Tool Body',
      from: 'protege@localhost',
    },
  });
  emailSendMessageId = String(sent.messageId ?? '');
});

describe('gateway runtime action invoker hardening', () => {
  it('rejects unsupported runtime actions', () => {
    expect(unknownActionError.includes('Unsupported runtime action')).toBe(true);
  });

  it('rejects email.send without recipients', () => {
    expect(missingRecipientError.includes('payload.to')).toBe(true);
  });

  it('rejects email.send without subject', () => {
    expect(missingSubjectError.includes('payload.subject')).toBe(true);
  });

  it('rejects email.send without text body', () => {
    expect(missingTextError.includes('payload.text')).toBe(true);
  });

  it('sends email and returns message id for valid payloads', () => {
    expect(emailSendMessageId.length > 0).toBe(true);
  });
});
