import type { InboundNormalizedMessage } from 'protege-toolkit';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildEmailSendRequestFromAction,
  inferThreadingModeFromRecipients,
} from '@extensions/tools/send-email/runtime-action';

const stubMessage: InboundNormalizedMessage = {
  messageId: '<inbound-123@example.com>',
  threadId: 'thread-abc',
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'persona@protege.local' }],
  cc: [],
  bcc: [],
  envelopeRcptTo: [{ address: 'persona@protege.local' }],
  subject: 'Original subject',
  text: 'Hello agent.',
  receivedAt: new Date().toISOString(),
  rawMimePath: '/tmp/raw.eml',
  attachments: [],
  references: [],
  metadata: {},
};

let inferredReplyMode = '';
let inferredNewThreadMode = '';
let inferredCaseInsensitiveMode = '';
let inferredMixedRecipientsMode = '';
let replySubject = '';
let replyInReplyTo: string | undefined = '';
let newThreadSubject = '';
let newThreadReferences: string[] = [];

beforeAll((): void => {
  inferredReplyMode = inferThreadingModeFromRecipients({
    to: ['sender@example.com'],
    inboundSenderAddress: 'sender@example.com',
  });

  inferredNewThreadMode = inferThreadingModeFromRecipients({
    to: ['thirdparty@elsewhere.com'],
    inboundSenderAddress: 'sender@example.com',
  });

  inferredCaseInsensitiveMode = inferThreadingModeFromRecipients({
    to: ['Sender@Example.COM'],
    inboundSenderAddress: 'sender@example.com',
  });

  inferredMixedRecipientsMode = inferThreadingModeFromRecipients({
    to: ['sender@example.com', 'thirdparty@elsewhere.com'],
    inboundSenderAddress: 'sender@example.com',
  });

  const replyRequest = buildEmailSendRequestFromAction({
    message: stubMessage,
    personaSenderAddress: 'persona@protege.local',
    payload: {
      to: ['sender@example.com'],
      subject: 'LLM chose this subject',
      body: 'Reply body.',
    },
  });
  replySubject = replyRequest.subject;
  replyInReplyTo = replyRequest.inReplyTo;

  const newThreadRequest = buildEmailSendRequestFromAction({
    message: stubMessage,
    personaSenderAddress: 'persona@protege.local',
    payload: {
      to: ['thirdparty@elsewhere.com'],
      subject: 'Outreach to third party',
      body: 'New conversation.',
    },
  });
  newThreadSubject = newThreadRequest.subject;
  newThreadReferences = newThreadRequest.references;
});

describe('inferThreadingModeFromRecipients', () => {
  it('returns reply_current when recipients include the inbound sender', () => {
    expect(inferredReplyMode).toBe('reply_current');
  });

  it('returns new_thread when no recipient matches the inbound sender', () => {
    expect(inferredNewThreadMode).toBe('new_thread');
  });

  it('matches sender addresses case-insensitively', () => {
    expect(inferredCaseInsensitiveMode).toBe('reply_current');
  });

  it('returns reply_current when sender is among multiple recipients', () => {
    expect(inferredMixedRecipientsMode).toBe('reply_current');
  });
});

describe('buildEmailSendRequestFromAction inferred threading', () => {
  it('uses Re: prefix on original subject when replying to inbound sender', () => {
    expect(replySubject).toBe('Re: Original subject');
  });

  it('sets inReplyTo to inbound message id when replying to sender', () => {
    expect(replyInReplyTo).toBe('<inbound-123@example.com>');
  });

  it('uses LLM subject when sending to a third party', () => {
    expect(newThreadSubject).toBe('Outreach to third party');
  });

  it('returns empty references when sending to a third party', () => {
    expect(newThreadReferences).toEqual([]);
  });
});
