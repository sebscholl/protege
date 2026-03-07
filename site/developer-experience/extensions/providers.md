# Providers

Providers normalize vendor-specific APIs behind one harness interface.

## Contract

Source of truth: `engine/harness/providers/contract.ts`

```ts
export type HarnessProviderAdapter = {
  readonly providerId: 'openai' | 'anthropic' | 'gemini' | 'grok';
  readonly capabilities: {
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
  generate: (
    args: {
      request: HarnessProviderGenerateRequest;
    },
  ) => Promise<HarnessProviderGenerateResponse>;
};
```

Model IDs are normalized as `provider/model` and parsed by `parseProviderModelId`.

## Read Next

1. [Built-in providers and configuration](/developer-experience/extensions/providers-built-ins)
2. [Build a custom provider](/developer-experience/extensions/providers-custom)
