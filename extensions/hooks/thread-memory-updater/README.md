# Thread Memory Updater Hook

Extension Surface: Yes

Purpose:

1. Subscribes to `harness.inference.completed`.
2. Synthesizes incremental thread memory summary state.
3. Emits `memory.thread.updated` for downstream active-memory updates.

Config keys:

1. `provider` (optional)
2. `model` (optional)
3. `prompt_path`
4. `max_delta_items`
5. `max_output_tokens`
