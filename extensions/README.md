# Extensions

Extension Surface: Yes

This directory contains installable capability extensions for Protege.

It includes tools and hooks loaded through `extensions/extensions.json`.

Developer guides:

1. Tools authoring: `extensions/tools/README.md`
2. Hooks authoring: `extensions/hooks/README.md`
3. Hook event catalog: `extensions/hooks/EVENTS.md`

## `extensions/extensions.json` schema

Top-level fields:

1. `tools`: array of tool entries.
2. `hooks`: array of hook entries.

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

## Extension Isolation Rules

1. Tool-specific code must live only inside its tool directory under `extensions/tools/{tool-name}/`.
2. Hook-specific code must live only inside its hook directory under `extensions/hooks/{hook-name}/`.
3. Core engine modules may load, validate, and execute extensions, but must not contain logic tied to a single tool or hook.
4. Each extension directory must expose a single entry point (`index.ts`) and keep its behavior self-contained.
5. Shared engine contracts must remain generic and reusable across all extensions.
