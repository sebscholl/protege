# Extensions

Extension Surface: Yes

This directory contains installable capability extensions for Protege.

It includes tools, hooks, and resolvers loaded through `extensions/extensions.json`.

Developer guides:

1. Tools authoring: `extensions/tools/README.md`
2. Hooks authoring: `extensions/hooks/README.md`
3. Hook event catalog: `extensions/hooks/EVENTS.md`
4. Resolver authoring: `extensions/resolvers/README.md`
5. Provider adapters: `extensions/providers/README.md`

## `extensions/extensions.json` schema

Top-level fields:

1. `providers`: array of provider entries.
2. `tools`: array of tool entries.
3. `hooks`: array of hook entries.
4. `resolvers`: array of resolver entries.

Provider entry forms:

1. String entry:
   1. `"openai"`
2. Object entry:
   1. `name`: non-empty provider adapter name.
   2. `enabled`: optional boolean (`false` disables entry).
   3. `config`: optional object merged with provider defaults.

Provider config keys:

1. `api_key_env`
2. `api_key` (legacy direct value fallback)
3. `base_url`
4. `version` (Anthropic only)

Tool entry forms:

1. String entry:
   1. `"web-search"`
2. Object entry:
   1. `name`: non-empty tool directory name.
   2. `enabled`: optional boolean (`false` disables entry).
   3. `config`: optional object deep-merged with the tool default config.

Tool config merge semantics:

1. objects: recursive merge
2. scalars: override
3. arrays: replace

Hook entry forms:

1. String entry:
   1. `"hook-name"`
2. Object entry:
   1. `name`: non-empty hook directory name.
   2. `events`: optional string array of subscribed event names (`["*"]` default).
   3. `config`: optional object deep-merged with the hook default config.

Resolver entry forms:

1. String entry:
   1. `"resolver-name"`
2. Object entry:
   1. `name`: non-empty resolver directory name.
   2. `enabled`: optional boolean (`false` disables entry).
   3. `config`: optional object deep-merged with resolver default config.

## Extension Isolation Rules

1. Tool-specific code must live only inside its tool directory under `extensions/tools/{tool-name}/`.
2. Hook-specific code must live only inside its hook directory under `extensions/hooks/{hook-name}/`.
3. Resolver-specific code must live only inside its resolver directory under `extensions/resolvers/{resolver-name}/`.
4. Provider-specific code must live under `extensions/providers/{provider-name}/`.
5. Core engine modules may load, validate, and execute extensions, but must not contain logic tied to a single tool, hook, resolver, or provider.
6. Each extension directory must expose a single entry point (`index.ts`) and keep its behavior self-contained.
7. Provider extension directories must include provider-local defaults in `config.json`.
8. Shared engine contracts must remain generic and reusable across all extensions.
