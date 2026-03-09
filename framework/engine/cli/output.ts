import type { PersonaMetadata } from '@engine/shared/personas';

import Table from 'cli-table3';

/**
 * Represents one JSON-serializable CLI payload.
 */
export type CliJsonValue = PersonaMetadata | PersonaMetadata[] | Record<string, unknown>;
export type CliOutputMode = 'json' | 'pretty';
export type CliTableCell = string | number | boolean | null | undefined;

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
  process.stdout.write(`\n${args.value}${'\n'.repeat(Math.max(0, trailingNewlines))}\n`);
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
 * Renders one plain terminal table using shared CLI table settings.
 */
export function renderCliTable(
  args: {
    head: string[];
    rows: CliTableCell[][];
    colAligns?: Array<'left' | 'center' | 'right'>;
  },
): string {
  const table = new Table({
    head: args.head,
    ...(args.colAligns ? { colAligns: args.colAligns } : {}),
    style: {
      head: [],
      border: [],
    },
  });
  for (const row of args.rows) {
    table.push(row.map((cell) => stringifyCliTableCell({
      cell,
    })));
  }

  return table.toString();
}

/**
 * Renders one two-column key/value table for readable CLI summaries.
 */
export function renderCliKeyValueTable(
  args: {
    rows: Array<{
      key: string;
      value: CliTableCell;
    }>;
  },
): string {
  return renderCliTable({
    head: ['Key', 'Value'],
    rows: args.rows.map((row) => [row.key, row.value]),
  });
}

/**
 * Converts one table cell value into a printable string.
 */
export function stringifyCliTableCell(
  args: {
    cell: CliTableCell;
  },
): string {
  if (args.cell === null || args.cell === undefined) {
    return '';
  }

  return String(args.cell);
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
