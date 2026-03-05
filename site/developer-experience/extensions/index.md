# Extensions Overview

Protege extension loading is manifest-driven through `extensions/extensions.json`.

## Manifest Shape

```ts
export type ExtensionManifest = {
  providers: Array<
    string | {
      name: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    }
  >;
  tools: Array<
    string | {
      name: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    }
  >;
  hooks: Array<
    string | {
      name: string;
      events?: string[];
      config?: Record<string, unknown>;
    }
  >;
  resolvers: Array<
    string | {
      name: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    }
  >;
};
```

## Entry Semantics

- **String entry**: enables extension by name with default config.
- **Object entry**: enables extension with optional config override.
- `enabled: false` disables only for types that support it (`providers`, `tools`, `resolvers`).

## Merge Semantics

Runtime uses deep merge for object config overrides:

- object keys: recursive merge
- scalar values: override
- arrays: replace

This behavior is shared by provider/tool/hook/resolver loaders.

## Directory Contracts

- providers: `extensions/providers/{name}/index.ts` + `config.json`
- tools: `extensions/tools/{name}/index.ts` or `index.js`
- hooks: `extensions/hooks/{name}/index.ts` or `index.js`
- resolvers: `extensions/resolvers/{name}/index.ts` or `index.js`

Resolution order for runtime-loaded modules is `index.js` first, then `index.ts`.

## Built-In Extension Sets

- tools: `shell`, `glob`, `search`, `read-file`, `write-file`, `edit-file`, `web-fetch`, `web-search`, `send-email`
- providers: `openai`, `anthropic`, `gemini`, `grok`
- resolvers: `load-file`, `thread-memory-state`, `invocation-metadata`, `thread-history`, `current-input`
- hooks: none enabled by default

## Next

- [Tools](/developer-experience/extensions/tools)
- [Providers](/developer-experience/extensions/providers)
- [Hooks](/developer-experience/extensions/hooks)
- [Resolvers](/developer-experience/extensions/resolvers)
