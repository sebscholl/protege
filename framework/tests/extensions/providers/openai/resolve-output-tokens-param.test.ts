import { describe, expect, it } from 'vitest';

import { resolveOpenAiOutputTokensParam } from '@extensions/providers/openai';

describe('resolveOpenAiOutputTokensParam', () => {
  it('returns max_tokens for standard models', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'gpt-4.1', maxOutputTokens: 1024 })).toEqual({ max_tokens: 1024 });
  });

  it('returns max_completion_tokens for o1 reasoning models', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'o1', maxOutputTokens: 2048 })).toEqual({ max_completion_tokens: 2048 });
  });

  it('returns max_completion_tokens for o3 reasoning models', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'o3-mini', maxOutputTokens: 512 })).toEqual({ max_completion_tokens: 512 });
  });

  it('returns max_completion_tokens for o4 reasoning models', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'o4-mini', maxOutputTokens: 4096 })).toEqual({ max_completion_tokens: 4096 });
  });

  it('returns empty object when maxOutputTokens is undefined', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'gpt-4.1' })).toEqual({});
  });

  it('returns empty object for reasoning models when maxOutputTokens is undefined', () => {
    expect(resolveOpenAiOutputTokensParam({ modelName: 'o3-mini' })).toEqual({});
  });
});
