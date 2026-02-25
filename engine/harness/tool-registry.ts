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
import { tool as writeFileTool } from '@extensions/tools/write-file/index';

/**
 * Represents one manifest entry for enabling a tool extension by name.
 */
export type ToolManifestEntry = string | {
  name: string;
  enabled?: boolean;
};

/**
 * Represents the extension manifest shape used by runtime registry loading.
 */
export type ExtensionManifest = {
  tools: ToolManifestEntry[];
  hooks: string[];
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
  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks as string[] : [];
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
  const enabledToolNames = normalizeEnabledToolNames({
    tools: manifest.tools,
  });
  const registry: HarnessToolRegistry = {};
  for (const toolName of enabledToolNames) {
    const tool = await loadToolDefinition({
      toolName,
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
 * Normalizes tool manifest entries into unique enabled tool names.
 */
export function normalizeEnabledToolNames(
  args: {
    tools: ToolManifestEntry[];
  },
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of args.tools) {
    if (typeof entry === 'string') {
      if (entry.trim().length > 0 && !seen.has(entry)) {
        seen.add(entry);
        names.push(entry);
      }
      continue;
    }

    if (entry.enabled === false || entry.name.trim().length === 0 || seen.has(entry.name)) {
      continue;
    }

    seen.add(entry.name);
    names.push(entry.name);
  }

  return names;
}

/**
 * Dynamically imports one tool extension module and validates its contract shape.
 */
export async function loadToolDefinition(
  args: {
    toolName: string;
  },
): Promise<HarnessToolDefinition> {
  const builtInToolDefinition = readBuiltInToolDefinition({
    toolName: args.toolName,
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

  return undefined;
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
