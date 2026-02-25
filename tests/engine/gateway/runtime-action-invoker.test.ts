import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildEmailSendRequestFromAction,
  createGatewayRuntimeActionInvoker,
  resolveReplyFromAddress,
  resolveReplySubject,
} from '@engine/gateway/index';

let unknownActionError = '';
let missingRecipientError = '';
let invalidRecipientError = '';
let missingSubjectError = '';
let missingTextError = '';
let emailSendMessageId = '';
let replyFromAddress = '';
let replySubject = '';
let newThreadReplySubject = '';
let implicitReplyAllCcCount = -1;
let explicitCcCount = -1;
let lockedFromAddress = '';
let defaultInReplyTo = '';
let defaultReferencesCount = -1;
let forcedReplyModeInReplyTo = '';
let forcedReplyModeSubject = '';
let newThreadModeInReplyTo = '';
let newThreadModeSubject = '';

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
    personaSenderAddress: 'persona@example.com',
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
        to: ['user'],
        subject: 'Hello',
        text: 'Body',
      },
    });
  } catch (error) {
    invalidRecipientError = (error as Error).message;
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

  replyFromAddress = resolveReplyFromAddress({
    personaSenderAddress: 'persona@example.com',
  });
  replySubject = resolveReplySubject({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    inReplyTo: '<inbound@example.com>',
    payloadSubject: 'Custom Subject',
  });
  newThreadReplySubject = resolveReplySubject({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    inReplyTo: '<new-thread-anchor@example.com>',
    payloadSubject: 'Custom Subject',
  });

  const noImplicitReplyAllRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [{ address: 'patricia@example.com' }],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      subject: 'Manual Test',
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  implicitReplyAllCcCount = noImplicitReplyAllRequest.cc?.length ?? 0;

  const explicitCcRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [{ address: 'patricia@example.com' }],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      cc: ['patricia@example.com'],
      subject: 'Manual Test',
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  explicitCcCount = explicitCcRequest.cc?.length ?? 0;

  const lockedFromRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      from: 'spoofed@example.com',
      subject: 'Manual Test',
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  lockedFromAddress = lockedFromRequest.from.address;

  const defaultThreadingRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: ['<root@example.com>', '<parent@example.com>'],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      subject: 'Manual Test',
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  defaultInReplyTo = defaultThreadingRequest.inReplyTo;
  defaultReferencesCount = defaultThreadingRequest.references.length;

  const forcedReplyModeRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: ['<root@example.com>', '<parent@example.com>'],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      subject: 'Custom Subject That Should Be Ignored',
      inReplyTo: '<different-anchor@example.com>',
      references: ['<different-root@example.com>'],
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  forcedReplyModeInReplyTo = forcedReplyModeRequest.inReplyTo;
  forcedReplyModeSubject = forcedReplyModeRequest.subject;

  const newThreadModeRequest = buildEmailSendRequestFromAction({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'persona@example.com' }],
      subject: 'Manual Test',
      text: 'Body',
      references: ['<root@example.com>', '<parent@example.com>'],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    payload: {
      to: ['sender@example.com'],
      subject: 'Intentional New Thread',
      inReplyTo: '<new-thread-anchor@example.com>',
      threadingMode: 'new_thread',
      references: ['<new-thread-root@example.com>'],
      text: 'Reply body',
    },
    personaSenderAddress: 'persona@example.com',
  });
  newThreadModeInReplyTo = newThreadModeRequest.inReplyTo;
  newThreadModeSubject = newThreadModeRequest.subject;
});

describe('gateway runtime action invoker hardening', () => {
  it('rejects unsupported runtime actions', () => {
    expect(unknownActionError.includes('Unsupported runtime action')).toBe(true);
  });

  it('rejects email.send without recipients', () => {
    expect(missingRecipientError.includes('payload.to')).toBe(true);
  });

  it('rejects email.send recipients that are not concrete email addresses', () => {
    expect(invalidRecipientError.includes('valid email addresses')).toBe(true);
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

  it('uses inbound persona recipient address as canonical reply from-address', () => {
    expect(replyFromAddress).toBe('persona@example.com');
  });

  it('normalizes threaded reply subjects from inbound subject context', () => {
    expect(replySubject).toBe('Re: Manual Test');
  });

  it('preserves payload subject for non-threaded sends', () => {
    expect(newThreadReplySubject).toBe('Custom Subject');
  });

  it('does not implicitly reply-all by copying inbound cc/bcc when payload omits them', () => {
    expect(implicitReplyAllCcCount).toBe(0);
  });

  it('includes cc recipients only when explicitly requested by the tool payload', () => {
    expect(explicitCcCount).toBe(1);
  });

  it('locks outbound from-address to inbound persona identity even if payload includes from', () => {
    expect(lockedFromAddress).toBe('persona@example.com');
  });

  it('defaults in-reply-to to inbound message id when payload omits threading fields', () => {
    expect(defaultInReplyTo).toBe('<inbound@example.com>');
  });

  it('defaults references to inbound reference chain when payload omits references', () => {
    expect(defaultReferencesCount).toBe(2);
  });

  it('forces in-reply-to to inbound message id in default threaded reply mode', () => {
    expect(forcedReplyModeInReplyTo).toBe('<inbound@example.com>');
  });

  it('forces reply subject from inbound subject in default threaded reply mode', () => {
    expect(forcedReplyModeSubject).toBe('Re: Manual Test');
  });

  it('allows custom in-reply-to when threading mode is explicitly new_thread', () => {
    expect(newThreadModeInReplyTo).toBe('<new-thread-anchor@example.com>');
  });

  it('allows custom subject when threading mode is explicitly new_thread', () => {
    expect(newThreadModeSubject).toBe('Intentional New Thread');
  });
});
