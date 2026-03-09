import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HarnessProviderId } from '@engine/harness/providers/contract';
import type {
  NormalizedProviderManifestEntry,
  ProviderManifestEntry,
} from '@engine/harness/tools/registry';

import {
  normalizeEnabledProviderEntries,
  readExtensionManifest,
  resolveDefaultExtensionsManifestPath,
} from '@engine/harness/tools/registry';

/**
 * Represents one normalized provider runtime configuration payload.
 */
export type ProviderRuntimeConfig = {
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  version?: string;
};

/**
 * Resolves selected provider runtime config from extension manifest.
 */
export function resolveSelectedProviderRuntimeConfig(
  args: {
    provider: HarnessProviderId;
    manifestPath?: string;
  },
): ProviderRuntimeConfig {
  const manifestPath = args.manifestPath ?? resolveDefaultExtensionsManifestPath();
  const manifest = readExtensionManifest({ manifestPath });
  const normalizedProviders = normalizeEnabledProviderEntries({
    providers: manifest.providers as ProviderManifestEntry[],
  });
  return parseProviderRuntimeConfig({
    provider: args.provider,
    entry: resolveProviderManifestEntryOrDefault({
      provider: args.provider,
      entries: normalizedProviders,
    }),
  });
}

/**
 * Resolves selected provider config from one typed provider map.
 */
export function selectProviderManifestEntry(
  args: {
    provider: HarnessProviderId;
    entries: NormalizedProviderManifestEntry[];
  },
): NormalizedProviderManifestEntry | undefined {
  return args.entries.find((entry) => entry.name === args.provider);
}

/**
 * Resolves selected provider config from manifest with fallback to built-in defaults when providers list is omitted.
 */
export function resolveProviderManifestEntryOrDefault(
  args: {
    provider: HarnessProviderId;
    entries: NormalizedProviderManifestEntry[];
  },
): NormalizedProviderManifestEntry {
  const selected = selectProviderManifestEntry({
    provider: args.provider,
    entries: args.entries,
  });
  if (selected) {
    return selected;
  }
  if (args.entries.length === 0) {
    return {
      name: args.provider,
    };
  }

  throw new Error(`Selected provider "${args.provider}" is not enabled in extensions/extensions.json providers[].`);
}

/**
 * Parses one normalized manifest provider entry into resolved runtime config values.
 */
export function parseProviderRuntimeConfig(
  args: {
    provider: HarnessProviderId;
    entry: NormalizedProviderManifestEntry;
  },
): ProviderRuntimeConfig {
  const defaults = readDefaultProviderRuntimeConfig({
    provider: args.provider,
  });
  const merged = mergeRecordWithOverride({
    base: defaults,
    override: args.entry.config,
  });
  const apiKeyEnv = readString({
    value: merged.api_key_env,
  });
  const directApiKey = readString({
    value: merged.api_key,
  });

  return {
    apiKey: directApiKey ?? readEnvApiKey({
      apiKeyEnv,
    }),
    apiKeyEnv,
    baseUrl: readString({
      value: merged.base_url,
    }),
    version: readString({
      value: merged.version,
    }),
  };
}

/**
 * Returns default provider config shape used when manifest entry omits config object.
 */
export function readDefaultProviderRuntimeConfig(
  args: {
    provider: HarnessProviderId;
  },
): Record<string, unknown> {
  const configPath = resolveProviderDefaultConfigPath({
    provider: args.provider,
  });
  if (!existsSync(configPath)) {
    throw new Error(`Default provider config not found at ${configPath}`);
  }

  return readJsonRecord({
    filePath: configPath,
  });
}

/**
 * Resolves the default provider config path for one built-in provider extension.
 */
export function resolveProviderDefaultConfigPath(
  args: {
    provider: HarnessProviderId;
  },
): string {
  return join(process.cwd(), 'extensions', 'providers', args.provider, 'config.json');
}

/**
 * Returns one env key value when present and non-empty.
 */
export function readEnvApiKey(
  args: {
    apiKeyEnv: string | undefined;
  },
): string | undefined {
  if (!args.apiKeyEnv) {
    return undefined;
  }

  const envValue = process.env[args.apiKeyEnv];
  return typeof envValue === 'string' && envValue.trim().length > 0
    ? envValue
    : undefined;
}

/**
 * Reads non-empty string from unknown input value.
 */
export function readString(
  args: {
    value: unknown;
  },
): string | undefined {
  return typeof args.value === 'string' && args.value.trim().length > 0
    ? args.value
    : undefined;
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
 * Reads one JSON file and returns it as a generic record.
 */
export function readJsonRecord(
  args: {
    filePath: string;
  },
): Record<string, unknown> {
  const text = readFileSync(args.filePath, 'utf8');
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Provider config at ${args.filePath} must be a JSON object.`);
  }

  return parsed;
}
