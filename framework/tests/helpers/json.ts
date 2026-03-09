/**
 * Converts one unknown value into a JSON-safe record shape for response helpers.
 */
export function toJsonRecord(
  args: {
    value: unknown;
  },
): Record<string, unknown> {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return {};
  }

  return args.value as Record<string, unknown>;
}
