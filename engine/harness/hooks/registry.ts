import type { HookManifestEntry, NormalizedHookManifestEntry } from '@engine/harness/tools/registry';
import type {
  HarnessHookEmittedEvent,
  HarnessHookOnEvent,
  HookEventName,
  HookEventPayloadByName,
} from '@engine/harness/hooks/events';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { onEvent as activeMemoryUpdaterOnEvent } from '@extensions/hooks/active-memory-updater/index';
import { onEvent as threadMemoryUpdaterOnEvent } from '@extensions/hooks/thread-memory-updater/index';
import { normalizeEnabledHookEntries, readExtensionManifest, resolveDefaultExtensionsManifestPath } from '@engine/harness/tools/registry';

/**
 * Represents one runtime hook entry with resolved subscriptions and config.
 */
export type HarnessHookEntry = {
  name: string;
  events: string[];
  config: Record<string, unknown>;
  onEvent: HarnessHookOnEvent;
};

/**
 * Represents one resolved hook module definition export.
 */
export type HarnessHookDefinition = {
  onEvent: HarnessHookOnEvent;
};

/**
 * Represents one async hook dispatch helper.
 */
export type HookDispatcher = {
  dispatch: <TEvent extends HookEventName>(
    event: TEvent,
    payload: HookEventPayloadByName[TEvent],
  ) => void;
};

/**
 * Loads enabled hooks from extensions manifest in deterministic manifest order.
 */
export async function loadHookRegistry(
  args: {
    manifestPath?: string;
  } = {},
): Promise<HarnessHookEntry[]> {
  const manifestPath = args.manifestPath ?? resolveDefaultExtensionsManifestPath();
  const manifest = readExtensionManifest({
    manifestPath,
  });
  const normalizedEntries = normalizeEnabledHookEntries({
    hooks: manifest.hooks as HookManifestEntry[],
  });
  const hooksBaseDirPath = resolveHooksBaseDirPath({
    manifestPath,
  });
  const loadedEntries: HarnessHookEntry[] = [];
  for (const entry of normalizedEntries) {
    const definition = await loadHookDefinition({
      hookName: entry.name,
      hooksBaseDirPath,
    });
    const defaultConfig = readHookDefaultConfig({
      hookName: entry.name,
      hooksBaseDirPath,
    });
    const resolvedConfig = mergeRecordWithOverride({
      base: defaultConfig,
      override: entry.config,
    });
    loadedEntries.push({
      name: entry.name,
      events: entry.events,
      config: resolvedConfig,
      onEvent: definition.onEvent,
    });
  }

  return loadedEntries;
}

/**
 * Creates one async, non-blocking hook dispatcher with failure isolation.
 */
export function createHookDispatcher(
  args: {
    hooks: HarnessHookEntry[];
    onHookError?: (
      hookName: string,
      event: HookEventName,
      error: Error,
    ) => void;
  },
): HookDispatcher {
  const dispatchInternal = <TEvent extends HookEventName>(
    event: TEvent,
    payload: HookEventPayloadByName[TEvent],
  ): void => {
    for (const hook of args.hooks) {
      if (!isHookSubscribedToEvent({
        hook,
        event,
      })) {
        continue;
      }

      void Promise.resolve(hook.onEvent(event, payload, hook.config))
        .then((result) => {
          dispatchEmittedEvents({
            emittedEvents: result?.emit,
            dispatch: dispatchInternal,
          });
        })
        .catch((error: unknown) => {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          args.onHookError?.(
            hook.name,
            event,
            normalizedError,
          );
        });
    }
  };

  return {
    dispatch: (
      event,
      payload,
    ): void => {
      dispatchInternal(event, payload);
    },
  };
}

/**
 * Dispatches one optional emitted-event list returned from hook callback execution.
 */
export function dispatchEmittedEvents(
  args: {
    emittedEvents: HarnessHookEmittedEvent[] | undefined;
    dispatch: <TEvent extends HookEventName>(
      event: TEvent,
      payload: HookEventPayloadByName[TEvent],
    ) => void;
  },
): void {
  if (!args.emittedEvents || args.emittedEvents.length === 0) {
    return;
  }

  for (const emittedEvent of args.emittedEvents) {
    args.dispatch(
      emittedEvent.event,
      emittedEvent.payload as HookEventPayloadByName[typeof emittedEvent.event],
    );
  }
}

/**
 * Resolves one hooks directory path from manifest location.
 */
export function resolveHooksBaseDirPath(
  args: {
    manifestPath: string;
  },
): string {
  return join(dirname(args.manifestPath), 'hooks');
}

/**
 * Reads hook default config from optional hook `config.json`.
 */
export function readHookDefaultConfig(
  args: {
    hookName: string;
    hooksBaseDirPath: string;
  },
): Record<string, unknown> {
  const configPath = join(args.hooksBaseDirPath, args.hookName, 'config.json');
  if (!existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Hook config must be an object: ${configPath}`);
  }

  return parsed;
}

/**
 * Loads one hook module and validates exported callback contract.
 */
export async function loadHookDefinition(
  args: {
    hookName: string;
    hooksBaseDirPath: string;
  },
): Promise<HarnessHookDefinition> {
  const builtInDefinition = getBuiltInHookDefinition({
    hookName: args.hookName,
  });
  if (builtInDefinition) {
    return builtInDefinition;
  }

  const modulePath = resolveHookModulePath({
    hookName: args.hookName,
    hooksBaseDirPath: args.hooksBaseDirPath,
  });
  if (!existsSync(modulePath)) {
    throw new Error(`Hook module not found: ${modulePath}`);
  }

  const moduleUrl = pathToFileURL(modulePath).href;
  const moduleRecord = await import(moduleUrl) as Record<string, unknown>;
  const onEvent = moduleRecord.onEvent;
  if (typeof onEvent !== 'function') {
    throw new Error(`Hook module ${args.hookName} must export onEvent(event, payload, config).`);
  }

  return {
    onEvent: onEvent as HarnessHookOnEvent,
  };
}

/**
 * Returns one built-in hook definition when shipped in core runtime.
 */
export function getBuiltInHookDefinition(
  args: {
    hookName: string;
  },
): HarnessHookDefinition | undefined {
  if (args.hookName === 'thread-memory-updater') {
    return {
      onEvent: threadMemoryUpdaterOnEvent as HarnessHookOnEvent,
    };
  }
  if (args.hookName === 'active-memory-updater') {
    return {
      onEvent: activeMemoryUpdaterOnEvent as HarnessHookOnEvent,
    };
  }

  return undefined;
}

/**
 * Resolves one hook module path with js/ts fallback.
 */
export function resolveHookModulePath(
  args: {
    hookName: string;
    hooksBaseDirPath: string;
  },
): string {
  const baseDirPath = join(args.hooksBaseDirPath, args.hookName);
  const jsModulePath = join(baseDirPath, 'index.js');
  if (existsSync(jsModulePath)) {
    return jsModulePath;
  }

  return join(baseDirPath, 'index.ts');
}

/**
 * Returns true when one hook subscriptions list includes target event.
 */
export function isHookSubscribedToEvent(
  args: {
    hook: NormalizedHookManifestEntry | HarnessHookEntry;
    event: HookEventName;
  },
): boolean {
  return args.hook.events.includes('*') || args.hook.events.includes(args.event);
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
