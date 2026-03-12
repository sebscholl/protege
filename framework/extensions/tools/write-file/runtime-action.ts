import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  readRequiredRuntimePath,
  readRuntimeStringValue,
} from '../shared/runtime-action-helpers';

/**
 * Runs one file.write runtime action and creates parent directories as needed.
 */
export function runWriteFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.write',
    enforceWorkspaceRoot: false,
  });
  const content = readRuntimeStringValue({
    payload: args.payload,
    fieldName: 'content',
    actionName: 'file.write',
  });
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
  return {
    path: targetPath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
  };
}
