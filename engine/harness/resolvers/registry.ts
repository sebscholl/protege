import type {
  NormalizedResolverManifestEntry,
  ResolverManifestEntry,
} from '@engine/harness/tools/registry';
import type {
  HarnessResolverDefinition,
  HarnessResolverEntry,
} from '@engine/harness/resolvers/types';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeEnabledResolverEntries,
  readExtensionManifest,
  resolveDefaultExtensionsManifestPath,
} from '@engine/harness/tools/registry';
import { resolver as activeMemoryResolver } from '@extensions/resolvers/active-memory/index';
import { resolver as currentInputResolver } from '@extensions/resolvers/current-input/index';
import { resolver as invocationMetadataResolver } from '@extensions/resolvers/invocation-metadata/index';
import { resolver as knowledgeGuidanceResolver } from '@extensions/resolvers/knowledge-guidance/index';
import { resolver as personaPromptResolver } from '@extensions/resolvers/persona-prompt/index';
import { resolver as systemPromptResolver } from '@extensions/resolvers/system-prompt/index';
import { resolver as threadHistoryResolver } from '@extensions/resolvers/thread-history/index';
import { resolver as threadMemoryStateResolver } from '@extensions/resolvers/thread-memory-state/index';

/**
 * Loads enabled resolvers from extensions manifest in deterministic manifest order.
 */
export async function loadResolverRegistry(
  args: {
    manifestPath?: string;
  } = {},
): Promise<HarnessResolverEntry[]> {
  const manifestPath = args.manifestPath ?? resolveDefaultExtensionsManifestPath();
  const manifest = readExtensionManifest({
    manifestPath,
  });
  const normalizedEntries = normalizeEnabledResolverEntries({
    resolvers: manifest.resolvers as ResolverManifestEntry[],
  });
  const resolversBaseDirPath = resolveResolversBaseDirPath({
    manifestPath,
  });
  const loadedEntries: HarnessResolverEntry[] = [];
  for (const entry of normalizedEntries) {
    const definition = await loadResolverDefinition({
      resolverName: entry.name,
      resolversBaseDirPath,
    });
    const defaultConfig = readResolverDefaultConfig({
      resolverName: entry.name,
      resolversBaseDirPath,
    });
    const resolvedConfig = mergeRecordWithOverride({
      base: defaultConfig,
      override: entry.config,
    });
    loadedEntries.push({
      name: definition.name,
      config: resolvedConfig,
      resolve: definition.resolve,
    });
  }

  return loadedEntries;
}

/**
 * Resolves one resolvers directory path from manifest location.
 */
export function resolveResolversBaseDirPath(
  args: {
    manifestPath: string;
  },
): string {
  return join(dirname(args.manifestPath), 'resolvers');
}

/**
 * Reads resolver default config from optional resolver `config.json`.
 */
export function readResolverDefaultConfig(
  args: {
    resolverName: string;
    resolversBaseDirPath: string;
  },
): Record<string, unknown> {
  const configPath = join(args.resolversBaseDirPath, args.resolverName, 'config.json');
  if (!existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Resolver config must be an object: ${configPath}`);
  }

  return parsed;
}

/**
 * Loads one resolver module and validates exported contract.
 */
export async function loadResolverDefinition(
  args: {
    resolverName: string;
    resolversBaseDirPath: string;
  },
): Promise<HarnessResolverDefinition> {
  const builtInResolverDefinition = readBuiltInResolverDefinition({
    resolverName: args.resolverName,
  });
  if (builtInResolverDefinition) {
    return builtInResolverDefinition;
  }

  const modulePath = resolveResolverModulePath({
    resolverName: args.resolverName,
    resolversBaseDirPath: args.resolversBaseDirPath,
  });
  if (!existsSync(modulePath)) {
    throw new Error(`Resolver module not found: ${modulePath}`);
  }

  const moduleUrl = pathToFileURL(modulePath).href;
  const moduleRecord = await import(moduleUrl) as Record<string, unknown>;
  const candidate = moduleRecord.resolver ?? moduleRecord.default;
  if (!isHarnessResolverDefinition(candidate)) {
    throw new Error(`Resolver module ${args.resolverName} does not export a valid resolver definition.`);
  }

  return candidate;
}

/**
 * Returns built-in resolver definitions when resolver is bundled in core runtime.
 */
export function readBuiltInResolverDefinition(
  args: {
    resolverName: string;
  },
): HarnessResolverDefinition | undefined {
  if (args.resolverName === 'system-prompt') {
    return systemPromptResolver;
  }
  if (args.resolverName === 'persona-prompt') {
    return personaPromptResolver;
  }
  if (args.resolverName === 'active-memory') {
    return activeMemoryResolver;
  }
  if (args.resolverName === 'thread-memory-state') {
    return threadMemoryStateResolver;
  }
  if (args.resolverName === 'invocation-metadata') {
    return invocationMetadataResolver;
  }
  if (args.resolverName === 'knowledge-guidance') {
    return knowledgeGuidanceResolver;
  }
  if (args.resolverName === 'thread-history') {
    return threadHistoryResolver;
  }
  if (args.resolverName === 'current-input') {
    return currentInputResolver;
  }

  return undefined;
}

/**
 * Resolves one resolver module path with js/ts fallback.
 */
export function resolveResolverModulePath(
  args: {
    resolverName: string;
    resolversBaseDirPath: string;
  },
): string {
  const baseDirPath = join(args.resolversBaseDirPath, args.resolverName);
  const jsModulePath = join(baseDirPath, 'index.js');
  if (existsSync(jsModulePath)) {
    return jsModulePath;
  }

  return join(baseDirPath, 'index.ts');
}

/**
 * Returns true when one unknown value satisfies resolver contract shape.
 */
export function isHarnessResolverDefinition(
  value: unknown,
): value is HarnessResolverDefinition {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.name === 'string'
    && value.name.trim().length > 0
    && typeof value.resolve === 'function';
}

/**
 * Deep merges record values with array replacement semantics.
 */
export function mergeRecordWithOverride(
  args: {
    base: Record<string, unknown>;
    override: Record<string, unknown> | undefined;
  },
): Record<string, unknown> {
  if (!args.override) {
    return { ...args.base };
  }

  const merged: Record<string, unknown> = { ...args.base };
  for (const [key, overrideValue] of Object.entries(args.override)) {
    const baseValue = merged[key];
    if (Array.isArray(overrideValue)) {
      merged[key] = [...overrideValue];
      continue;
    }
    if (isRecord(baseValue) && isRecord(overrideValue)) {
      merged[key] = mergeRecordWithOverride({
        base: baseValue,
        override: overrideValue,
      });
      continue;
    }

    merged[key] = overrideValue;
  }

  return merged;
}

/**
 * Returns true when one unknown value is a non-array object record.
 */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes resolver manifest entries for tests and external consumers.
 */
export function normalizeResolverManifestEntries(
  args: {
    resolvers: ResolverManifestEntry[];
  },
): NormalizedResolverManifestEntry[] {
  return normalizeEnabledResolverEntries({
    resolvers: args.resolvers,
  });
}
