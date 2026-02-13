import type { SMTPServerDataStream } from 'smtp-server';

import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readStreamBuffer } from '@engine/gateway/inbound';

/**
 * Creates a fixture stream that emits an error before completion.
 */
function createErrorStream(): SMTPServerDataStream {
  const stream = new Readable({
    read(): void {
      this.push(Buffer.from('partial', 'utf8'));
      this.destroy(new Error('stream failure'));
    },
  });
  return stream as SMTPServerDataStream;
}

describe('gateway inbound failure behavior', () => {
  it('rejects when inbound smtp stream emits an error', async () => {
    await expect(readStreamBuffer({ stream: createErrorStream() })).rejects.toThrow('stream failure');
  });
});
