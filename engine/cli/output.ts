import type { PersonaMetadata } from '@engine/shared/personas';

/**
 * Represents one JSON-serializable CLI payload.
 */
export type CliJsonValue = PersonaMetadata | PersonaMetadata[] | Record<string, unknown>;
export type CliOutputMode = 'json' | 'pretty';

/**
 * Emits one plain-text line block to stdout.
 */
export function emitCliText(
  args: {
    value: string;
    trailingNewlines?: number;
  },
): void {
  const trailingNewlines = args.trailingNewlines ?? 1;
  process.stdout.write(`${args.value}${'\n'.repeat(Math.max(0, trailingNewlines))}`);
}

/**
 * Emits one JSON payload line to stdout for CLI data responses.
 */
export function emitCliJson(
  args: {
    value: CliJsonValue;
  },
): void {
  emitCliText({
    value: JSON.stringify(args.value),
  });
}

/**
 * Emits CLI output in JSON or pretty-text mode using one centralized branch.
 */
export function emitCliOutput(
  args: {
    mode: CliOutputMode;
    jsonValue: CliJsonValue;
    prettyText: string;
    trailingNewlines?: number;
  },
): void {
  if (args.mode === 'json') {
    emitCliJson({
      value: args.jsonValue,
    });
    return;
  }

  emitCliText({
    value: args.prettyText,
    trailingNewlines: args.trailingNewlines,
  });
}

/**
 * Writes one JSON payload line to stdout for CLI data responses.
 * Kept as a compatibility wrapper while CLI callers migrate to `emitCliJson`.
 */
export function writeCliJson(
  args: {
    value: CliJsonValue;
  },
): void {
  emitCliJson({
    value: args.value,
  });
}
