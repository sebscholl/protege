# Extensions

Extension Surface: Yes

This directory contains installable capability extensions for Protege.

It includes tools and hooks loaded through `extensions/extensions.json`.

## Extension Isolation Rules

1. Tool-specific code must live only inside its tool directory under `extensions/tools/{tool-name}/`.
2. Hook-specific code must live only inside its hook directory under `extensions/hooks/{hook-name}/`.
3. Core engine modules may load, validate, and execute extensions, but must not contain logic tied to a single tool or hook.
4. Each extension directory must expose a single entry point (`index.ts`) and keep its behavior self-contained.
5. Shared engine contracts must remain generic and reusable across all extensions.
