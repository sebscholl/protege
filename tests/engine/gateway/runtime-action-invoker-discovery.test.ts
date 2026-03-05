import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let globPaths: string[] = [];
let globTruncated = false;
let globTotalMatches = -1;
let searchMatchesCount = 0;
let firstMatchPath = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

function createDiscoveryInboundMessage(): ReturnType<typeof createInboundMessage> {
  return createInboundMessage({
    personaId: 'persona-test',
    messageId: '<inbound@example.com>',
    threadId: 'thread-1',
    subject: 'Hello',
    text: 'Body',
  });
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-runtime-discovery-actions-',
  });
  tempRootPath = workspace.tempRootPath;
  workspace.writeFile({
    relativePath: 'src/alpha.ts',
    payload: 'const TODO = "ship";\n',
  });
  workspace.writeFile({
    relativePath: 'docs/guide.md',
    payload: '# TODO\n',
  });
  workspace.writeFile({
    relativePath: 'docs/notes.md',
    payload: '## TODO\n',
  });

  const invoke = createGatewayRuntimeActionInvoker({
    message: createDiscoveryInboundMessage(),
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
  workspace.cleanup();
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
