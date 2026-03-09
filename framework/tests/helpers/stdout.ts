/**
 * Captures stdout output while running one callback and returns buffered text.
 */
export async function captureStdout(
  args: {
    run: () => Promise<void> | void;
  },
): Promise<string> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  try {
    await args.run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join('');
}
