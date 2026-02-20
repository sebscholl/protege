import { describe, expect, it } from 'vitest';

import { parseChatArgs } from '@engine/cli/chat';

describe('chat cli args', () => {
  it('parses required persona selector', () => {
    expect(parseChatArgs({ argv: ['--persona', 'abc123'] }).persona).toBe('abc123');
  });

  it('parses optional thread id selector', () => {
    expect(parseChatArgs({ argv: ['--persona', 'abc123', '--thread', 'thread-1'] }).threadId).toBe('thread-1');
  });

  it('throws usage error when persona selector is missing', () => {
    expect(() => parseChatArgs({ argv: [] })).toThrow('Usage: protege chat');
  });
});
