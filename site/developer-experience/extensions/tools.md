# Tools

Tools are model-callable actions. They expose capabilities (file IO, shell, web, email) through a single harness contract.

## Contract

Source of truth: `engine/harness/tools/contract.ts`

```ts
export type HarnessToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    args: {
      input: Record<string, unknown>;
      context: HarnessToolExecutionContext;
    },
  ) => Promise<Record<string, unknown>>;
};
```

```ts
export type HarnessToolExecutionContext = {
  runtime: {
    invoke: (
      args: {
        action: string;
        payload: Record<string, unknown>;
      },
    ) => Promise<Record<string, unknown>>;
  };
  logger?: GatewayLogger;
};
```

## Read Next

1. [Built-in tools and configuration](/developer-experience/extensions/tools-built-ins)
2. [Build a custom tool](/developer-experience/extensions/tools-custom)
