import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';

let tempRootPath = '';
let previousCwd = '';
let readContent = '';
let writeContent = '';
let editedContent = '';
let editAppliedCount = -1;
let editTextNotFoundError = '';
let outsideReadContent = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-runtime-file-actions-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);
  mkdirSync(join(tempRootPath, 'tmp'), { recursive: true });
  writeFileSync(join(tempRootPath, 'tmp', 'read-target.txt'), 'alpha', 'utf8');
  writeFileSync(join(tempRootPath, 'tmp', 'edit-target.txt'), 'alpha beta alpha', 'utf8');
  writeFileSync(join(tmpdir(), 'protege-outside-runtime-read.txt'), 'outside-content', 'utf8');

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
      path: join(tmpdir(), 'protege-outside-runtime-read.txt'),
    },
  });
  outsideReadContent = String(outsideReadResult.content ?? '');
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
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

  it('fails file.edit when oldText is not present', () => {
    expect(editTextNotFoundError.includes('could not find')).toBe(true);
  });

  it('allows file actions outside workspace root for v1 flexibility', () => {
    expect(outsideReadContent).toBe('outside-content');
  });
});
