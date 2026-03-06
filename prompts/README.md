# Prompts

Extension Surface: Yes

This directory contains user-editable prompt templates used by the harness and built-in hooks.

Use this directory for markdown prompt text only.

Default files:

1. `system.md`: base system behavior loaded by context pipeline.
2. `memory/thread-summary.md`: synthesis prompt for thread-memory updates.
3. `memory/active-summary.md`: synthesis prompt for active-memory updates.

Prompt loading behavior is configured in `configs/context.json` and extension configs in `extensions/`.
