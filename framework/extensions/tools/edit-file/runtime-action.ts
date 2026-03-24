import { readFileSync, writeFileSync } from 'node:fs';

import { readRequiredRuntimePath } from '../shared/runtime-action-helpers';

/**
 * Runs one file.edit runtime action using line-range replacement semantics.
 *
 * Reads the target file, replaces lines startLine through endLine (1-based,
 * inclusive) with the provided content, and writes the result back to disk.
 */
export function runEditFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.edit',
    enforceWorkspaceRoot: false,
  });
  const startLine = readRequiredRuntimeInteger({
    payload: args.payload,
    fieldName: 'startLine',
    actionName: 'file.edit',
  });
  const endLine = readRequiredRuntimeInteger({
    payload: args.payload,
    fieldName: 'endLine',
    actionName: 'file.edit',
  });
  const content = readRuntimeContentString({
    payload: args.payload,
    fieldName: 'content',
    actionName: 'file.edit',
  });

  const original = readFileSync(targetPath, 'utf8');
  const lines = original.split('\n');

  if (startLine < 1) {
    throw new Error('file.edit startLine must be >= 1.');
  }
  if (endLine > lines.length) {
    throw new Error(`file.edit endLine (${endLine}) exceeds file length (${lines.length} lines).`);
  }

  const replacementLines = content.length === 0 ? [] : content.split('\n');
  const removedLines = endLine - startLine + 1;

  lines.splice(startLine - 1, removedLines, ...replacementLines);

  writeFileSync(targetPath, lines.join('\n'), 'utf8');

  return {
    path: targetPath,
    removedLines,
    insertedLines: replacementLines.length,
  };
}

/**
 * Reads one required integer field from a runtime action payload.
 */
function readRequiredRuntimeInteger(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): number {
  const value = args.payload[args.fieldName];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be an integer.`);
  }

  return value;
}

/**
 * Reads one required string field from a runtime action payload (may be empty).
 */
function readRuntimeContentString(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const value = args.payload[args.fieldName];
  if (typeof value !== 'string') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a string.`);
  }

  return value;
}
