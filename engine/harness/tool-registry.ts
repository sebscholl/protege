import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
  HarnessToolRegistry,
} from '@engine/harness/tool-contract';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { tool as editFileTool } from '@extensions/tools/edit-file/index';
import { tool as globTool } from '@extensions/tools/glob/index';
import { tool as readFileTool } from '@extensions/tools/read-file/index';
import { tool as searchTool } from '@extensions/tools/search/index';
import { tool as sendEmailTool } from '@extensions/tools/send-email/index';
import { tool as shellTool } from '@extensions/tools/shell/index';
import { tool as webFetchTool } from '@extensions/tools/web-fetch/index';
import { createWebSearchTool } from '@extensions/tools/web-search/index';
import { tool as writeFileTool } from '@extensions/tools/write-file/index';

/**
 * Represents one manifest entry for enabling a tool extension by name.
 */
export type ToolManifestEntry = string | {
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

/**
 * Represents one normalized enabled tool manifest entry.
 */
export type NormalizedToolManifestEntry = {
  name: string;
  config?: Record<string, unknown>;
};

/**
 * Represents one manifest entry for enabling a hook extension by name.
 */
export type HookManifestEntry = string | {
  name: string;
  events?: string[];
  config?: Record<string, unknown>;
};

/**
 * Represents one normalized hook manifest entry.
 */
export type NormalizedHookManifestEntry = {
  name: string;
  events: string[];
  config?: Record<string, unknown>;
};

/**
 * Represents the extension manifest shape used by runtime registry loading.
 */
export type ExtensionManifest = {
  tools: ToolManifestEntry[];
  hooks: HookManifestEntry[];
};

/**
 * Resolves the default extension manifest path in the workspace.
 */
export function resolveDefaultExtensionsManifestPath(): string {
  return join(process.cwd(), 'extensions', 'extensions.json');
}

/**
 * Reads and parses the extension manifest from disk.
 */
export function readExtensionManifest(
  args: {
    manifestPath?: string;
  } = {},
): ExtensionManifest {
  const manifestPath = args.manifestPath ?? resolveDefaultExtensionsManifestPath();
  if (!existsSync(manifestPath)) {
    return {
      tools: [],
      hooks: [],
    };
  }

  const text = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const tools = Array.isArray(parsed.tools) ? parsed.tools as ToolManifestEntry[] : [];
  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks as HookManifestEntry[] : [];
  return {
    tools,
    hooks,
  };
}

/**
 * Loads all enabled tools from the extension manifest into one runtime registry.
 */
export async function loadToolRegistry(
  args: {
    manifestPath?: string;
  } = {},
): Promise<HarnessToolRegistry> {
  const manifest = readExtensionManifest({
    manifestPath: args.manifestPath,
  });
  const enabledToolEntries = normalizeEnabledToolEntries({
    tools: manifest.tools,
  });
  const registry: HarnessToolRegistry = {};
  for (const entry of enabledToolEntries) {
    const tool = await loadToolDefinition({
      toolName: entry.name,
      configOverride: entry.config,
    });
    registry[tool.name] = tool;
  }

  return registry;
}

/**
 * Executes one registered tool by name and returns its structured result payload.
 */
export async function executeRegisteredTool(
  args: {
    registry: HarnessToolRegistry;
    name: string;
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const tool = args.registry[args.name];
  if (!tool) {
    throw new Error(`Tool not found: ${args.name}`);
  }

  return tool.execute({
    input: args.input,
    context: args.context,
  });
}

/**
 * Normalizes tool manifest entries into unique enabled tool entries.
 */
export function normalizeEnabledToolEntries(
  args: {
    tools: ToolManifestEntry[];
  },
): NormalizedToolManifestEntry[] {
  const seen = new Set<string>();
  const entries: NormalizedToolManifestEntry[] = [];
  for (const [index, entry] of args.tools.entries()) {
    if (typeof entry === 'string') {
      const normalizedName = entry.trim();
      if (normalizedName.length > 0 && !seen.has(normalizedName)) {
        seen.add(normalizedName);
        entries.push({ name: normalizedName });
      }
      continue;
    }

    if (!isRecord(entry)) {
      throw new Error(`Invalid tool manifest entry at index ${index}: expected string or object.`);
    }
    if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      throw new Error(`Invalid tool manifest entry at index ${index}: "name" must be a non-empty string.`);
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      throw new Error(`Invalid tool manifest entry "${entry.name}": "enabled" must be boolean when provided.`);
    }
    if (entry.config !== undefined && !isRecord(entry.config)) {
      throw new Error(`Invalid tool manifest entry "${entry.name}": "config" must be an object when provided.`);
    }

    const normalizedName = entry.name.trim();
    if (entry.enabled === false || seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    entries.push({
      name: normalizedName,
      config: entry.config,
    });
  }

  return entries;
}

/**
 * Normalizes hook manifest entries into unique hook subscriptions preserving manifest order.
 */
export function normalizeEnabledHookEntries(
  args: {
    hooks: HookManifestEntry[];
  },
): NormalizedHookManifestEntry[] {
  const seen = new Set<string>();
  const entries: NormalizedHookManifestEntry[] = [];
  for (const [index, entry] of args.hooks.entries()) {
    if (typeof entry === 'string') {
      const normalizedName = entry.trim();
      if (normalizedName.length === 0 || seen.has(normalizedName)) {
        continue;
      }

      seen.add(normalizedName);
      entries.push({
        name: normalizedName,
        events: ['*'],
      });
      continue;
    }

    if (!isRecord(entry)) {
      throw new Error(`Invalid hook manifest entry at index ${index}: expected string or object.`);
    }
    if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      throw new Error(`Invalid hook manifest entry at index ${index}: "name" must be a non-empty string.`);
    }
    if (entry.events !== undefined && (!Array.isArray(entry.events) || !entry.events.every((event) => typeof event === 'string'))) {
      throw new Error(`Invalid hook manifest entry "${entry.name}": "events" must be a string array when provided.`);
    }
    if (entry.config !== undefined && !isRecord(entry.config)) {
      throw new Error(`Invalid hook manifest entry "${entry.name}": "config" must be an object when provided.`);
    }

    const normalizedName = entry.name.trim();
    if (seen.has(normalizedName)) {
      continue;
    }

    const normalizedEvents = normalizeHookEvents({
      events: entry.events,
    });
    seen.add(normalizedName);
    entries.push({
      name: normalizedName,
      events: normalizedEvents,
      config: entry.config,
    });
  }

  return entries;
}

/**
 * Normalizes optional hook event subscriptions with wildcard fallback.
 */
export function normalizeHookEvents(
  args: {
    events: string[] | undefined;
  },
): string[] {
  if (!args.events || args.events.length === 0) {
    return ['*'];
  }

  const normalized: string[] = [];
  for (const eventName of args.events) {
    const trimmedName = eventName.trim();
    if (trimmedName.length === 0 || normalized.includes(trimmedName)) {
      continue;
    }
    normalized.push(trimmedName);
  }

  return normalized.length > 0 ? normalized : ['*'];
}

/**
 * Dynamically imports one tool extension module and validates its contract shape.
 */
export async function loadToolDefinition(
  args: {
    toolName: string;
    configOverride?: Record<string, unknown>;
  },
): Promise<HarnessToolDefinition> {
  const builtInToolDefinition = readBuiltInToolDefinition({
    toolName: args.toolName,
    configOverride: args.configOverride,
  });
  if (builtInToolDefinition) {
    return builtInToolDefinition;
  }

  const modulePath = resolveToolModulePath({
    toolName: args.toolName,
  });
  if (!existsSync(modulePath)) {
    throw new Error(`Tool module not found: ${modulePath}`);
  }

  const moduleUrl = pathToFileURL(modulePath).href;
  const moduleRecord = await import(moduleUrl) as Record<string, unknown>;
  const factoryCandidate = moduleRecord.createTool;
  if (isToolFactoryFunction(factoryCandidate)) {
    return factoryCandidate({
      configOverride: args.configOverride,
    });
  }
  const candidate = moduleRecord.tool ?? moduleRecord.default;
  if (!isHarnessToolDefinition(candidate)) {
    throw new Error(`Tool module ${args.toolName} does not export a valid tool definition.`);
  }

  return candidate;
}

/**
 * Resolves one tool module path from workspace extension directories using js/ts fallback.
 */
export function resolveToolModulePath(
  args: {
    toolName: string;
  },
): string {
  const baseDirPath = join(process.cwd(), 'extensions', 'tools', args.toolName);
  const jsModulePath = join(baseDirPath, 'index.js');
  if (existsSync(jsModulePath)) {
    return jsModulePath;
  }

  return join(baseDirPath, 'index.ts');
}

/**
 * Returns a built-in tool definition when one is bundled in core runtime.
 */
export function readBuiltInToolDefinition(
  args: {
    toolName: string;
    configOverride?: Record<string, unknown>;
  },
): HarnessToolDefinition | undefined {
  if (args.toolName === 'shell') {
    return shellTool;
  }
  if (args.toolName === 'glob') {
    return globTool;
  }
  if (args.toolName === 'search') {
    return searchTool;
  }
  if (args.toolName === 'read-file') {
    return readFileTool;
  }
  if (args.toolName === 'write-file') {
    return writeFileTool;
  }
  if (args.toolName === 'edit-file') {
    return editFileTool;
  }
  if (args.toolName === 'send-email') {
    return sendEmailTool;
  }
  if (args.toolName === 'web-fetch') {
    return webFetchTool;
  }
  if (args.toolName === 'web-search') {
    return createWebSearchTool({
      configOverride: args.configOverride,
    });
  }

  return undefined;
}

/**
 * Returns true when one unknown value is a supported tool factory function.
 */
export function isToolFactoryFunction(
  value: unknown,
): value is (
  args: {
    configOverride?: Record<string, unknown>;
  },
) => HarnessToolDefinition {
  return typeof value === 'function';
}

/**
 * Returns true when one unknown value satisfies the harness tool contract.
 */
export function isHarnessToolDefinition(
  value: unknown,
): value is HarnessToolDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.name === 'string'
    && typeof record.description === 'string'
    && typeof record.execute === 'function'
    && isRecord(record.inputSchema);
}

/**
 * Returns true when one unknown value is a non-null non-array record.
 */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}
