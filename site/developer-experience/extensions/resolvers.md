# Resolvers

Resolvers are context loaders used by the harness context pipeline (`configs/context.json`).

## Resolver Contract

```ts
import type { HarnessContextHistoryEntry } from '@engine/harness/types';

export type ResolverInvocation = {
  type: 'thread' | 'responsibility';
  context: Record<string, unknown>;
};

export type ResolverOutput =
  | string
  | {
      sections?: string[];
      activeMemory?: string;
      history?: HarnessContextHistoryEntry[];
      inputText?: string;
    };

export type HarnessResolverDefinition = {
  name: string;
  resolve: (args: {
    invocation: ResolverInvocation;
    config: Record<string, unknown>;
    resolverArgs: string[];
  }) => Promise<ResolverOutput | null | undefined> | ResolverOutput | null | undefined;
};
```

## Context Step Syntax

In `configs/context.json`, each step is a resolver call:

- `resolver-name`
- `resolver-name(arg1, arg2, arg3)`

Arguments are parsed as positional strings and passed in `resolverArgs`.

## Built-In Resolvers

- `load-file`
- `thread-memory-state`
- `invocation-metadata`
- `thread-history`
- `current-input`

### `load-file`

Loads a file path from first positional arg and supports placeholder interpolation from invocation context, for example:

```json
"load-file(personas/{persona_id}/PERSONA.md)"
```

### `thread-history`

Reads `messages` and `thread_tool_events` from SQLite and returns a trimmed history list based on token budget.

### `thread-memory-state`

Current implementation is placeholder (`null`) and reserved for future DB-backed summaries.

### `invocation-metadata`

Builds a routing note from inbound metadata (`from`, `to`, `cc`, `bcc`, references, reply defaults).

### `current-input`

Sets terminal `inputText` from invocation input body.

## Build a Custom Resolver

```ts
import type { HarnessResolverDefinition } from '@engine/harness/resolvers/types';

export const resolver: HarnessResolverDefinition = {
  name: 'custom-note',
  resolve: ({ invocation, resolverArgs }) => {
    const personaId = String(invocation.context.personaId ?? 'unknown');
    const label = resolverArgs[0] ?? 'default';

    return {
      sections: [
        `Custom context note for persona ${personaId}.`,
        `Resolver label: ${label}`,
      ],
    };
  },
};
```

Register it in `extensions/extensions.json -> resolvers`.
