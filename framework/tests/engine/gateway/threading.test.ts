import { describe, expect, it } from 'vitest';

import {
  buildReplyReferences,
  buildReplySubject,
  deriveThreadId,
  ensureMessageId,
  normalizeMessageId,
} from '@engine/gateway/threading';

describe('gateway threading utilities', () => {
  it('normalizes message ids with brackets and preserves case', () => {
    expect(normalizeMessageId({ value: ' Foo@Bar.COM ' })).toBe('<Foo@Bar.COM>');
  });

  it('preserves mixed-case Message-IDs from Gmail', () => {
    const gmailId = '<CALt4BUQooUKMNXsnFSJebs3K0jjk=6z4Mq=ZwZSi48-HCkMZ3A@mail.gmail.com>';
    expect(normalizeMessageId({ value: gmailId })).toBe(gmailId);
  });

  it('ensures message ids fall back to synthetic values', () => {
    expect(ensureMessageId({ value: '' }).startsWith('<synthetic.')).toBe(true);
  });

  it('derives thread ids from root reference first', () => {
    expect(deriveThreadId({ references: ['<a@b>', '<c@d>'], messageId: '<m@n>' })).toBe(deriveThreadId({ references: ['<a@b>', '<e@f>'], messageId: '<x@y>' }));
  });

  it('derives thread ids from in-reply-to when references are absent', () => {
    expect(deriveThreadId({ references: [], inReplyTo: '<reply@id>', messageId: '<m@n>' })).toBe(deriveThreadId({ references: [], inReplyTo: '<reply@id>', messageId: '<z@w>' }));
  });

  it('builds outbound references by appending normalized parent id', () => {
    expect(buildReplyReferences({ inboundReferences: ['<a@b>'], parentMessageId: 'C@D' })).toEqual(['<a@b>', '<C@D>']);
  });

  it('adds re prefix to plain subjects', () => {
    expect(buildReplySubject({ subject: 'hello' })).toBe('Re: hello');
  });

  it('keeps existing re prefix untouched', () => {
    expect(buildReplySubject({ subject: 'Re: hello' })).toBe('Re: hello');
  });

  it('derives the same thread id for all replies in a linear thread', () => {
    const root = '<root@example.com>';
    const reply1 = '<reply1@example.com>';
    const reply2 = '<reply2@example.com>';

    const threadFromFirstReply = deriveThreadId({ references: [root], messageId: reply1 });
    const threadFromSecondReply = deriveThreadId({ references: [root, reply1], messageId: reply2 });
    const threadFromThirdReply = deriveThreadId({ references: [root, reply1, reply2], messageId: '<reply3@example.com>' });

    expect(threadFromFirstReply).toBe(threadFromSecondReply);
    expect(threadFromSecondReply).toBe(threadFromThirdReply);
  });

  it('groups the root message with its first reply', () => {
    const rootMessageId = '<root@example.com>';

    const threadFromRoot = deriveThreadId({ references: [], messageId: rootMessageId });
    const threadFromReply = deriveThreadId({ references: [rootMessageId], messageId: '<reply@example.com>' });

    expect(threadFromRoot).toBe(threadFromReply);
  });

  it('derives the same thread id for branching replies with the same root', () => {
    const root = '<root@example.com>';
    const branchA = deriveThreadId({ references: [root, '<a@example.com>'], messageId: '<a2@example.com>' });
    const branchB = deriveThreadId({ references: [root, '<b@example.com>'], messageId: '<b2@example.com>' });

    expect(branchA).toBe(branchB);
  });

  it('groups replies with mixed-case root references into the same thread', () => {
    const originalId = '<CALt4BUQoo@mail.gmail.com>';
    const replyId = '<protege.abc123@localhost>';

    const threadFromOriginal = deriveThreadId({ references: [], messageId: originalId });
    const threadFromReply = deriveThreadId({ references: [originalId], messageId: replyId });

    expect(threadFromOriginal).toBe(threadFromReply);
  });
});
