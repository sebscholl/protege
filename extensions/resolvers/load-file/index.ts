import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { HarnessResolverDefinition } from '@protege-pack/toolkit';

/**
 * Loads one file path from resolver positional argument and emits its trimmed content.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'load-file',
  resolve: ({ invocation, resolverArgs }): string | null => {
    const rawPath = resolverArgs[0] ?? '';
    if (rawPath.length === 0) {
      return null;
    }

    const expandedPath = expandPathTemplate({
      template: rawPath,
      context: invocation.context,
    });
    const resolvedPath = isAbsolute(expandedPath) ? expandedPath : join(process.cwd(), expandedPath);
    if (!existsSync(resolvedPath)) {
      return null;
    }

    const text = readFileSync(resolvedPath, 'utf8').trim();
    return text.length > 0 ? text : null;
  },
};

/**
 * Expands `{placeholder}` tokens from invocation context with snake_case/camelCase fallback.
 */
export function expandPathTemplate(
  args: {
    template: string;
    context: Record<string, unknown>;
  },
): string {
  return args.template.replaceAll(/\{([^{}]+)\}/g, (_match, key): string => {
    const value = readContextValue({
      key: String(key).trim(),
      context: args.context,
    });
    return typeof value === 'string' ? value : '';
  });
}

/**
 * Reads one template token value from invocation context.
 */
export function readContextValue(
  args: {
    key: string;
    context: Record<string, unknown>;
  },
): unknown {
  if (args.key in args.context) {
    return args.context[args.key];
  }

  const camelCaseKey = toCamelCase({
    value: args.key,
  });
  return args.context[camelCaseKey];
}

/**
 * Converts one snake_case token to camelCase.
 */
export function toCamelCase(
  args: {
    value: string;
  },
): string {
  return args.value.replaceAll(/_([a-z])/g, (_match, character: string) => character.toUpperCase());
}
