import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { beforeAll, describe, expect, it } from 'vitest';

import { runEditFileRuntimeAction } from '@extensions/tools/edit-file/runtime-action';

const tempDir = mkdtempSync(join(tmpdir(), 'edit-file-test-'));

let singleLineResult: Record<string, unknown> = {};
let singleLineContent = '';
let rangeResult: Record<string, unknown> = {};
let rangeContent = '';
let expandContent = '';
let shrinkContent = '';
let deleteContent = '';
let outOfBoundsError = '';
let endExceedsError = '';
let preservedContent = '';
let newlinesAndTabsContent = '';

beforeAll((): void => {
  const original = 'line 1\nline 2\nline 3\nline 4\nline 5\n';

  const singlePath = join(tempDir, 'single.txt');
  writeFileSync(singlePath, original, 'utf8');
  singleLineResult = runEditFileRuntimeAction({
    payload: { path: singlePath, startLine: 3, endLine: 3, content: 'replaced line 3' },
  });
  singleLineContent = readFileSync(singlePath, 'utf8');

  const rangePath = join(tempDir, 'range.txt');
  writeFileSync(rangePath, original, 'utf8');
  rangeResult = runEditFileRuntimeAction({
    payload: { path: rangePath, startLine: 2, endLine: 4, content: 'new 2\nnew 3\nnew 4' },
  });
  rangeContent = readFileSync(rangePath, 'utf8');

  const expandPath = join(tempDir, 'expand.txt');
  writeFileSync(expandPath, original, 'utf8');
  runEditFileRuntimeAction({
    payload: { path: expandPath, startLine: 2, endLine: 2, content: 'expanded a\nexpanded b\nexpanded c' },
  });
  expandContent = readFileSync(expandPath, 'utf8');

  const shrinkPath = join(tempDir, 'shrink.txt');
  writeFileSync(shrinkPath, original, 'utf8');
  runEditFileRuntimeAction({
    payload: { path: shrinkPath, startLine: 2, endLine: 4, content: 'one line' },
  });
  shrinkContent = readFileSync(shrinkPath, 'utf8');

  const deletePath = join(tempDir, 'delete.txt');
  writeFileSync(deletePath, original, 'utf8');
  runEditFileRuntimeAction({
    payload: { path: deletePath, startLine: 2, endLine: 4, content: '' },
  });
  deleteContent = readFileSync(deletePath, 'utf8');

  const boundsPath = join(tempDir, 'bounds.txt');
  writeFileSync(boundsPath, original, 'utf8');
  try {
    runEditFileRuntimeAction({
      payload: { path: boundsPath, startLine: 0, endLine: 3, content: 'x' },
    });
  } catch (error) {
    outOfBoundsError = (error as Error).message;
  }

  try {
    runEditFileRuntimeAction({
      payload: { path: boundsPath, startLine: 1, endLine: 99, content: 'x' },
    });
  } catch (error) {
    endExceedsError = (error as Error).message;
  }

  const preservePath = join(tempDir, 'preserve.txt');
  writeFileSync(preservePath, original, 'utf8');
  runEditFileRuntimeAction({
    payload: { path: preservePath, startLine: 3, endLine: 3, content: 'CHANGED' },
  });
  preservedContent = readFileSync(preservePath, 'utf8');

  const escapesPath = join(tempDir, 'escapes.txt');
  writeFileSync(escapesPath, 'line 1\nline 2\nline 3\n', 'utf8');
  runEditFileRuntimeAction({
    payload: {
      path: escapesPath,
      startLine: 2,
      endLine: 2,
      content: 'function hello() {\n\treturn "world";\n}',
    },
  });
  newlinesAndTabsContent = readFileSync(escapesPath, 'utf8');
});

describe('edit_file runtime action', () => {
  it('replaces a single line at the specified position', () => {
    expect(singleLineContent).toBe('line 1\nline 2\nreplaced line 3\nline 4\nline 5\n');
  });

  it('returns removedLines count for single-line edits', () => {
    expect(singleLineResult.removedLines).toBe(1);
  });

  it('returns insertedLines count for single-line edits', () => {
    expect(singleLineResult.insertedLines).toBe(1);
  });

  it('replaces a range of lines with new content', () => {
    expect(rangeContent).toBe('line 1\nnew 2\nnew 3\nnew 4\nline 5\n');
  });

  it('returns removedLines count for range edits', () => {
    expect(rangeResult.removedLines).toBe(3);
  });

  it('inserts more lines than it removes when content is longer', () => {
    expect(expandContent).toBe('line 1\nexpanded a\nexpanded b\nexpanded c\nline 3\nline 4\nline 5\n');
  });

  it('inserts fewer lines than it removes when content is shorter', () => {
    expect(shrinkContent).toBe('line 1\none line\nline 5\n');
  });

  it('deletes lines when content is empty', () => {
    expect(deleteContent).toBe('line 1\nline 5\n');
  });

  it('fails when startLine is less than 1', () => {
    expect(outOfBoundsError.includes('startLine')).toBe(true);
  });

  it('fails when endLine exceeds file length', () => {
    expect(endExceedsError.includes('endLine')).toBe(true);
  });

  it('preserves lines outside the edited range', () => {
    expect(preservedContent.startsWith('line 1\nline 2\n')).toBe(true);
    expect(preservedContent.endsWith('line 4\nline 5\n')).toBe(true);
  });

  it('writes content with embedded newlines and tabs correctly', () => {
    expect(newlinesAndTabsContent).toBe('line 1\nfunction hello() {\n\treturn "world";\n}\nline 3\n');
  });
});
