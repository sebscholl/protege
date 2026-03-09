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
let editAppliedCount = -1;
let editTextNotFoundError = '';
let windowsEditedContent = '';
let windowsEditAppliedCount = -1;
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
    payload: 'alpha beta alpha',
  });
  workspace.writeFile({
    relativePath: 'tmp/windows-edit-target.txt',
    payload: 'first\r\nsecond\r\nthird',
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
      oldText: 'alpha',
      newText: 'omega',
      replaceAll: true,
    },
  });
  editAppliedCount = Number(editResult.appliedEdits ?? -1);
  editedContent = readFileSync(join(tempRootPath, 'tmp', 'edit-target.txt'), 'utf8');

  const windowsEditResult = await invoke({
    action: 'file.edit',
    payload: {
      path: 'tmp/windows-edit-target.txt',
      oldText: 'first\nsecond',
      newText: 'first\nupdated',
    },
  });
  windowsEditAppliedCount = Number(windowsEditResult.appliedEdits ?? -1);
  windowsEditedContent = readFileSync(join(tempRootPath, 'tmp', 'windows-edit-target.txt'), 'utf8');

  try {
    await invoke({
      action: 'file.edit',
      payload: {
        path: 'tmp/edit-target.txt',
        oldText: 'not-present',
        newText: 'x',
      },
    });
  } catch (error) {
    editTextNotFoundError = (error as Error).message;
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

  it('applies literal replacements through file.edit action', () => {
    expect(editedContent).toBe('omega beta omega');
  });

  it('returns applied edit count for file.edit action', () => {
    expect(editAppliedCount).toBe(2);
  });

  it('matches oldText against CRLF files when payload uses LF newlines', () => {
    expect(windowsEditAppliedCount).toBe(1);
  });

  it('applies replacement content using target file newline style', () => {
    expect(windowsEditedContent).toBe('first\r\nupdated\r\nthird');
  });

  it('fails file.edit when oldText is not present', () => {
    expect(editTextNotFoundError.includes('could not find')).toBe(true);
  });

  it('allows file actions outside workspace root for v1 flexibility', () => {
    expect(outsideReadContent).toBe('outside-content');
  });
});
