import { describe, expect, it } from 'vitest';

import { parseChatArgs } from '@engine/cli/chat';

describe('chat cli args', () => {
  it('parses optional persona selector when provided', () => {
    expect(parseChatArgs({ argv: ['--persona', 'abc123'] }).persona).toBe('abc123');
  });

  it('parses empty options without requiring persona selector', () => {
    expect(parseChatArgs({ argv: [] }).persona).toBe(undefined);
  });

  it('parses optional thread id selector', () => {
    expect(parseChatArgs({ argv: ['--persona', 'abc123', '--thread', 'thread-1'] }).threadId).toBe('thread-1');
  });

  it('parses thread id without requiring persona selector', () => {
    expect(parseChatArgs({ argv: ['--thread', 'thread-1'] }).threadId).toBe('thread-1');
  });
});
