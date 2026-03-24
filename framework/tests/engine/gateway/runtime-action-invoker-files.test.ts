import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let readContent = '';
let writeContent = '';
let editedContent = '';
let editRemovedLines = -1;
let editInsertedLines = -1;
let editOutOfBoundsError = '';
let outsideReadContent = '';
let outsideFilePath = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

/**
 * Creates one deterministic inbound message for runtime file-action tests.
 */
function createFileActionsInboundMessage(): ReturnType<typeof createInboundMessage> {
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
    tempPrefix: 'protege-runtime-file-actions-',
  });
  tempRootPath = workspace.tempRootPath;
  workspace.writeFile({
    relativePath: 'tmp/read-target.txt',
    payload: 'alpha',
  });
  workspace.writeFile({
    relativePath: 'tmp/edit-target.txt',
    payload: 'line 1\nline 2\nline 3\nline 4\n',
  });
  outsideFilePath = join('/tmp', 'protege-outside-runtime-read.txt');
  writeFileSync(outsideFilePath, 'outside-content', 'utf8');

  const invoke = createGatewayRuntimeActionInvoker({
    message: createFileActionsInboundMessage(),
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
  });

  const readResult = await invoke({
    action: 'file.read',
    payload: {
      path: 'tmp/read-target.txt',
    },
  });
  readContent = String(readResult.content ?? '');

  await invoke({
    action: 'file.write',
    payload: {
      path: 'tmp/write-target.txt',
      content: 'written-content',
    },
  });
  writeContent = readFileSync(join(tempRootPath, 'tmp', 'write-target.txt'), 'utf8');

  const editResult = await invoke({
    action: 'file.edit',
    payload: {
      path: 'tmp/edit-target.txt',
      startLine: 2,
      endLine: 3,
      content: 'replaced 2\nreplaced 3',
    },
  });
  editRemovedLines = Number(editResult.removedLines ?? -1);
  editInsertedLines = Number(editResult.insertedLines ?? -1);
  editedContent = readFileSync(join(tempRootPath, 'tmp', 'edit-target.txt'), 'utf8');

  try {
    await invoke({
      action: 'file.edit',
      payload: {
        path: 'tmp/edit-target.txt',
        startLine: 0,
        endLine: 1,
        content: 'x',
      },
    });
  } catch (error) {
    editOutOfBoundsError = (error as Error).message;
  }

  const outsideReadResult = await invoke({
    action: 'file.read',
    payload: {
      path: outsideFilePath,
    },
  });
  outsideReadContent = String(outsideReadResult.content ?? '');
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway runtime action invoker file actions', () => {
  it('reads file content through file.read action', () => {
    expect(readContent).toBe('alpha');
  });

  it('writes file content through file.write action', () => {
    expect(writeContent).toBe('written-content');
  });

  it('replaces a line range through file.edit action', () => {
    expect(editedContent).toBe('line 1\nreplaced 2\nreplaced 3\nline 4\n');
  });

  it('returns removedLines count for file.edit action', () => {
    expect(editRemovedLines).toBe(2);
  });

  it('returns insertedLines count for file.edit action', () => {
    expect(editInsertedLines).toBe(2);
  });

  it('fails file.edit when startLine is out of bounds', () => {
    expect(editOutOfBoundsError.includes('startLine')).toBe(true);
  });

  it('allows file actions outside workspace root for v1 flexibility', () => {
    expect(outsideReadContent).toBe('outside-content');
  });
});
