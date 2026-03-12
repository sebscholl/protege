import { readFileSync } from 'node:fs';

import { readRequiredRuntimePath } from '../shared/runtime-action-helpers';

/**
 * Runs one file.read runtime action and returns full text content.
 */
export function runReadFileRuntimeAction(
  args: {
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  const targetPath = readRequiredRuntimePath({
    payload: args.payload,
    fieldName: 'path',
    actionName: 'file.read',
    enforceWorkspaceRoot: false,
  });
  const content = readFileSync(targetPath, 'utf8');
  return {
    path: targetPath,
    content,
  };
}
