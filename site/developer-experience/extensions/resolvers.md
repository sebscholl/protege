# Resolvers

Resolvers build context in a deterministic load order defined by `configs/context.json`.

## Contract

Source of truth: `engine/harness/resolvers/types.ts`

```ts
export type ResolverInvocation = {
  type: 'thread' | 'responsibility';
  context: Record<string, unknown>;
};
```

```ts
export type ResolverOutput = string | {
  sections?: string[];
  activeMemory?: string;
  history?: HarnessContextHistoryEntry[];
  inputText?: string;
};
```

```ts
export type HarnessResolverDefinition = {
  name: string;
  resolve: (
    args: {
      invocation: ResolverInvocation;
      config: Record<string, unknown>;
      resolverArgs: string[];
    },
  ) => Promise<ResolverOutput | null | undefined> | ResolverOutput | null | undefined;
};
```

## Read Next

1. [Built-in resolvers and configuration](/developer-experience/extensions/resolvers-built-ins)
2. [Build a custom resolver](/developer-experience/extensions/resolvers-custom)
