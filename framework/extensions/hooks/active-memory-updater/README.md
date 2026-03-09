# Active Memory Updater Hook

Extension Surface: Yes

Purpose:

1. Subscribes to `memory.thread.updated`.
2. Marks persona active-memory state dirty and synthesizes consolidated `active.md`.
3. Emits `memory.active.updated` after successful write.
4. Persists dirty/error state on synthesis failure so gateway startup recovery can re-dispatch synthesis.

Config keys:

1. `provider` (optional)
2. `model` (optional)
3. `prompt_path`
4. `max_recent_threads`
5. `max_output_tokens`
6. `debounce_ms`
