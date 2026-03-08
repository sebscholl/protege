# Extensions Overview

All of Protege's capabilities come from extensions. The engine itself is an orchestrator — extensions provide the tools, LLM adapters, event hooks, and context builders that make your agent useful.

## The Manifest

Extensions are registered in `extensions/extensions.json`. This file tells the engine what to load at startup:

```json
{
  "providers": ["openai", "anthropic"],
  "tools": ["shell", "glob", "search", "read-file", "write-file", "edit-file", "web-fetch", "web-search", "send-email"],
  "hooks": [
    {
      "name": "thread-memory-updater",
      "events": ["harness.inference.completed"]
    },
    {
      "name": "active-memory-updater",
      "events": ["memory.thread.updated"]
    }
  ],
  "resolvers": ["load-file", "thread-memory-state", "invocation-metadata", "thread-history", "current-input"]
}
```

If an extension isn't in this file, it doesn't load — even if the code exists in the `extensions/` directory.

## String vs Object Entries

Every extension list supports two entry formats:

**String entry** — uses defaults:

```json
"web-search"
```

**Object entry** — overrides configuration:

```json
{
  "name": "web-search",
  "enabled": true,
  "config": {
    "provider": "tavily",
    "defaultMaxResults": 10
  }
}
```

You can mix both formats in the same list.

## How Config Merging Works

Each extension can ship a `config.json` with default settings. When you provide `config` overrides in the manifest, they are deep-merged:

- **Object values** — merged recursively
- **Scalar values** (strings, numbers, booleans) — overridden
- **Arrays** — replaced entirely (not appended)

For example, if `extensions/tools/web-search/config.json` contains:

```json
{
  "provider": "perplexity",
  "defaultMaxResults": 5,
  "providers": {
    "perplexity": { "apiKeyEnv": "PERPLEXITY_API_KEY" },
    "tavily": { "apiKeyEnv": "TAVILY_API_KEY" }
  }
}
```

And your manifest entry is:

```json
{
  "name": "web-search",
  "config": {
    "provider": "tavily",
    "defaultMaxResults": 10
  }
}
```

The effective config becomes:

```json
{
  "provider": "tavily",
  "defaultMaxResults": 10,
  "providers": {
    "perplexity": { "apiKeyEnv": "PERPLEXITY_API_KEY" },
    "tavily": { "apiKeyEnv": "TAVILY_API_KEY" }
  }
}
```

The `provider` and `defaultMaxResults` were overridden, while `providers` was preserved from defaults.

## Extension Directory Structure

Every extension lives in a directory under `extensions/{type}/{name}/`:

```
extensions/tools/web-search/
├── index.ts        # Required: exports the extension contract
├── config.json     # Optional: default configuration
└── README.md       # Optional: documentation
```

The engine loads extensions by importing the `index.ts` (compiled to `index.js`) entry point and reading the typed export (`tool`, `provider`, `onEvent`, or `resolver` depending on the type).

## Disabling an Extension

Remove it from the manifest, or use the object form with `enabled: false`:

```json
{
  "name": "shell",
  "enabled": false
}
```

## Next Steps

- **[Tools](/developer-experience/extensions/tools)** — built-in tools and how to write your own
- **[Providers](/developer-experience/extensions/providers)** — LLM adapters
- **[Hooks](/developer-experience/extensions/hooks)** — event observers
- **[Resolvers](/developer-experience/extensions/resolvers)** — context pipeline builders
