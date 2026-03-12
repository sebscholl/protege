import { isAbsolute, resolve, relative } from 'node:path';

/**
 * Reads one required runtime path and resolves it within workspace root when requested.
 */
export function readRequiredRuntimePath(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
    enforceWorkspaceRoot?: boolean;
  },
): string {
  const rawPath = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: args.fieldName,
    actionName: args.actionName,
  });
  if (args.enforceWorkspaceRoot === true) {
    return resolveWorkspacePath({
      inputPath: rawPath,
      actionName: args.actionName,
    });
  }

  return resolve(rawPath);
}

/**
 * Reads one required non-empty runtime payload string.
 */
export function readRequiredRuntimeString(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const value = args.payload[args.fieldName];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${args.actionName} payload.${args.fieldName} is required.`);
  }

  return value;
}

/**
 * Reads one required runtime payload string and allows empty text content values.
 */
export function readRuntimeStringValue(
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

/**
 * Reads one optional boolean runtime payload value.
 */
export function readOptionalRuntimeBoolean(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): boolean | undefined {
  const value = args.payload[args.fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a boolean.`);
  }

  return value;
}

/**
 * Reads one optional positive integer runtime payload value.
 */
export function readOptionalRuntimePositiveInteger(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): number | undefined {
  const value = args.payload[args.fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a positive integer.`);
  }

  return value;
}

/**
 * Resolves one input path inside workspace root and blocks traversal outside it.
 */
export function resolveWorkspacePath(
  args: {
    inputPath: string;
    actionName: string;
  },
): string {
  const workspaceRoot = process.cwd();
  const resolvedPath = resolve(workspaceRoot, args.inputPath);
  const relativePath = relative(workspaceRoot, resolvedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${args.actionName} path resolves outside workspace root.`);
  }

  return resolvedPath;
}

/**
 * Reads one required runtime URL and enforces http/https schemes.
 */
export function readRequiredHttpRuntimeUrl(
  args: {
    payload: Record<string, unknown>;
    fieldName: string;
    actionName: string;
  },
): string {
  const raw = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: args.fieldName,
    actionName: args.actionName,
  });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${args.actionName} payload.${args.fieldName} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${args.actionName} payload.${args.fieldName} must use http or https.`);
  }

  return parsed.toString();
}
