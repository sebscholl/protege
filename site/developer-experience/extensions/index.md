# Extensions

Protege is extension-first. The engine orchestrates behavior, and extension modules provide the capabilities.

This section is organized by extension type:

1. what ships built-in,
2. how to configure it in `extensions/extensions.json`,
3. how to build your own implementation.

## Manifest

All extension loading is driven by `extensions/extensions.json`.

```json
{
  "providers": ["openai"],
  "tools": ["shell", "send-email"],
  "hooks": [
    {
      "name": "thread-memory-updater",
      "events": ["harness.inference.completed"],
      "config": {
        "max_output_tokens": 600
      }
    }
  ],
  "resolvers": [
    "load-file",
    "thread-history",
    "current-input"
  ]
}
```

## Entry Forms

Each extension list supports string and object entries.

String entry:

```json
"web-search"
```

Object entry:

```json
{
  "name": "web-search",
  "enabled": true,
  "config": {
    "provider": "tavily"
  }
}
```

## Merge Semantics

Config merge behavior is consistent across providers/tools/hooks/resolvers:

1. object values: deep merge,
2. scalar values: override,
3. arrays: replace.

## Contracts and Isolation

1. extension code lives under `extensions/{type}/{name}/`.
2. each extension exports one typed entry point from `index.ts` (or `index.js` at runtime).
3. engine modules may load and run extensions, but extension-specific behavior should stay in extension directories.

## Next

1. [Tools overview](/developer-experience/extensions/tools)
2. [Providers overview](/developer-experience/extensions/providers)
3. [Hooks overview](/developer-experience/extensions/hooks)
4. [Resolvers overview](/developer-experience/extensions/resolvers)
