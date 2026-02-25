/**
 * Waits for one predicate to pass within timeout or throws when timeout elapses.
 */
export async function waitForCondition(
  args: {
    timeoutMs: number;
    intervalMs: number;
    predicate: () => boolean;
    timeoutMessage?: string;
  },
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= args.timeoutMs) {
    if (args.predicate()) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, args.intervalMs);
    });
  }

  throw new Error(args.timeoutMessage ?? 'Timed out waiting for condition.');
}
