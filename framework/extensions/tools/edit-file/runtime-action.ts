import { readFileSync, writeFileSync } from 'node:fs';

import {
  readOptionalRuntimeBoolean,
  readRequiredRuntimePath,
  readRequiredRuntimeString,
  readRuntimeStringValue,
} from '../shared/runtime-action-helpers';

/**
 * Runs one file.edit runtime action using literal replacement semantics.
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
  const oldText = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'oldText',
    actionName: 'file.edit',
  });
  if (oldText.length === 0) {
    throw new Error('file.edit payload.oldText must not be empty.');
  }
  const newText = readRuntimeStringValue({
    payload: args.payload,
    fieldName: 'newText',
    actionName: 'file.edit',
  });
  const replaceAll = readOptionalRuntimeBoolean({
    payload: args.payload,
    fieldName: 'replaceAll',
    actionName: 'file.edit',
  }) ?? false;

  const original = readFileSync(targetPath, 'utf8');
  const primaryMatchCount = countLiteralMatches({
    haystack: original,
    needle: oldText,
  });
  const newlineVariant = buildNewlineAdjustedEditPayload({
    original,
    oldText,
    newText,
  });
  const fallbackMatchCount = newlineVariant
    ? countLiteralMatches({
      haystack: original,
      needle: newlineVariant.oldText,
    })
    : 0;
  const usingFallback = primaryMatchCount <= 0 && fallbackMatchCount > 0 && newlineVariant !== undefined;
  const selectedOldText = usingFallback ? newlineVariant.oldText : oldText;
  const selectedNewText = usingFallback ? newlineVariant.newText : newText;
  const matchCount = usingFallback ? fallbackMatchCount : primaryMatchCount;
  if (matchCount <= 0) {
    const newlineHint = hasNewlineOnlyMatch({
      original,
      oldText,
    })
      ? ' Newline style mismatch detected between payload.oldText and file content.'
      : '';
    throw new Error(`file.edit could not find payload.oldText in target file.${newlineHint}`);
  }

  const next = replaceAll
    ? original.split(selectedOldText).join(selectedNewText)
    : original.replace(selectedOldText, selectedNewText);
  writeFileSync(targetPath, next, 'utf8');
  return {
    path: targetPath,
    appliedEdits: replaceAll ? matchCount : 1,
  };
}

/**
 * Counts literal occurrences of one needle inside one haystack string.
 */
export function countLiteralMatches(
  args: {
    haystack: string;
    needle: string;
  },
): number {
  return args.haystack.split(args.needle).length - 1;
}

/**
 * Builds newline-adjusted edit payload text when file and payload newline styles differ.
 */
export function buildNewlineAdjustedEditPayload(
  args: {
    original: string;
    oldText: string;
    newText: string;
  },
): {
  oldText: string;
  newText: string;
} | undefined {
  if (args.original.includes('\r\n') && args.oldText.includes('\n') && !args.oldText.includes('\r\n')) {
    return {
      oldText: args.oldText.replace(/\n/g, '\r\n'),
      newText: args.newText.replace(/\n/g, '\r\n'),
    };
  }

  if (!args.original.includes('\r\n') && args.oldText.includes('\r\n')) {
    return {
      oldText: args.oldText.replace(/\r\n/g, '\n'),
      newText: args.newText.replace(/\r\n/g, '\n'),
    };
  }

  return undefined;
}

/**
 * Returns true when oldText matches only after normalizing both values to LF newlines.
 */
export function hasNewlineOnlyMatch(
  args: {
    original: string;
    oldText: string;
  },
): boolean {
  const normalizedOriginal = args.original.replace(/\r\n/g, '\n');
  const normalizedOldText = args.oldText.replace(/\r\n/g, '\n');
  if (normalizedOriginal === args.original && normalizedOldText === args.oldText) {
    return false;
  }

  return normalizedOriginal.includes(normalizedOldText);
}
