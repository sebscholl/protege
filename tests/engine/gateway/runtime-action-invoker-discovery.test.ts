import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chdir, cwd } from 'node:process';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';

let tempRootPath = '';
let previousCwd = '';
let globPaths: string[] = [];
let globTruncated = false;
let globTotalMatches = -1;
let searchMatchesCount = 0;
let firstMatchPath = '';

beforeAll(async (): Promise<void> => {
  previousCwd = cwd();
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-discovery-actions-'));
  mkdirSync(join(tempRootPath, 'src'), { recursive: true });
  mkdirSync(join(tempRootPath, 'docs'), { recursive: true });
  writeFileSync(join(tempRootPath, 'src', 'alpha.ts'), 'const TODO = "ship";\n', 'utf8');
  writeFileSync(join(tempRootPath, 'docs', 'guide.md'), '# TODO\n', 'utf8');
  writeFileSync(join(tempRootPath, 'docs', 'notes.md'), '## TODO\n', 'utf8');
  chdir(tempRootPath);

  const invoke = createGatewayRuntimeActionInvoker({
    message: {
      personaId: 'persona-test',
      messageId: '<inbound@example.com>',
      threadId: 'thread-1',
      from: [{ address: 'sender@example.com' }],
      to: [{ address: 'agent@example.com' }],
      cc: [],
      bcc: [],
      envelopeRcptTo: [{ address: 'agent@example.com' }],
      subject: 'Hello',
      text: 'Body',
      references: [],
      receivedAt: '2026-02-14T00:00:00.000Z',
      rawMimePath: '/tmp/inbound.eml',
      attachments: [],
    },
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
  });

  const globResult = await invoke({
    action: 'file.glob',
    payload: {
      pattern: '**/*.md',
      maxResults: 1,
    },
  });
  globPaths = Array.isArray(globResult.paths)
    ? globResult.paths.map((path) => String(path))
    : [];
  globTruncated = Boolean(globResult.truncated);
  globTotalMatches = Number(globResult.totalMatches ?? -1);

  const searchResult = await invoke({
    action: 'file.search',
    payload: {
      query: 'TODO',
      path: '.',
      maxResults: 10,
    },
  });
  const matches = Array.isArray(searchResult.matches)
    ? searchResult.matches as Array<Record<string, unknown>>
    : [];
  searchMatchesCount = matches.length;
  firstMatchPath = matches.length > 0 ? String(matches[0].path ?? '') : '';
});

afterAll((): void => {
  chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('gateway runtime action invoker discovery actions', () => {
  it('returns glob matches for file.glob action', () => {
    expect(globPaths.length).toBe(1);
  });

  it('returns truncation metadata for capped file.glob action results', () => {
    expect(globTruncated).toBe(true);
  });

  it('returns total match count before truncation for file.glob action', () => {
    expect(globTotalMatches >= globPaths.length).toBe(true);
  });

  it('returns search matches for file.search action', () => {
    expect(searchMatchesCount > 0).toBe(true);
  });

  it('returns workspace-relative paths in search match payloads', () => {
    expect(firstMatchPath.includes('/')).toBe(true);
  });
});
