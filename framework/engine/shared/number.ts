/**
 * Parses one optional string as positive integer, or returns fallback when invalid.
 */
export function readPositiveIntOrFallback(
  args: {
    raw?: string;
    fallback: number;
  },
): number {
  const parsed = Number.parseInt(args.raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return args.fallback;
  }

  return parsed;
}
