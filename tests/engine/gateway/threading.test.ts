import { describe, expect, it } from 'vitest';

import {
  buildReplyReferences,
  buildReplySubject,
  deriveThreadId,
  ensureMessageId,
  normalizeMessageId,
} from '@engine/gateway/threading';

describe('gateway threading utilities', () => {
  it('normalizes message ids with brackets and lowercase', () => {
    expect(normalizeMessageId({ value: ' Foo@Bar.COM ' })).toBe('<foo@bar.com>');
  });

  it('ensures message ids fall back to synthetic values', () => {
    expect(ensureMessageId({ value: '' }).startsWith('<synthetic.')).toBe(true);
  });

  it('derives thread ids from last reference first', () => {
    expect(deriveThreadId({ references: ['<a@b>', '<c@d>'], messageId: '<m@n>' })).toBe(deriveThreadId({ references: ['<a@b>', '<c@d>'], messageId: '<x@y>' }));
  });

  it('derives thread ids from in-reply-to when references are absent', () => {
    expect(deriveThreadId({ references: [], inReplyTo: '<reply@id>', messageId: '<m@n>' })).toBe(deriveThreadId({ references: [], inReplyTo: '<reply@id>', messageId: '<z@w>' }));
  });

  it('builds outbound references by appending normalized parent id', () => {
    expect(buildReplyReferences({ inboundReferences: ['<a@b>'], parentMessageId: 'C@D' })).toEqual(['<a@b>', '<c@d>']);
  });

  it('adds re prefix to plain subjects', () => {
    expect(buildReplySubject({ subject: 'hello' })).toBe('Re: hello');
  });

  it('keeps existing re prefix untouched', () => {
    expect(buildReplySubject({ subject: 'Re: hello' })).toBe('Re: hello');
  });
});
