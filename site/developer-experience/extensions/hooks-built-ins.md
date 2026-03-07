# Built-In Hooks

Built-in hooks currently enabled in `extensions/extensions.json`:

1. `thread-memory-updater`
2. `active-memory-updater`

These implement the memory synthesis chain:

1. `harness.inference.completed` -> thread summary update,
2. emits `memory.thread.updated`,
3. `active-memory-updater` listens and refreshes `memory/{persona_id}/active.md`.

## Manifest Example

```json
{
  "hooks": [
    {
      "name": "thread-memory-updater",
      "events": ["harness.inference.completed"],
      "config": {
        "prompt_path": "prompts/thread-summary.md",
        "max_delta_items": 24,
        "max_output_tokens": 800
      }
    },
    {
      "name": "active-memory-updater",
      "events": ["memory.thread.updated"],
      "config": {
        "prompt_path": "prompts/active-summary.md",
        "max_recent_threads": 6,
        "max_output_tokens": 600,
        "debounce_ms": 0
      }
    }
  ]
}
```

## Config Keys

`thread-memory-updater`:

1. `prompt_path`
2. `max_delta_items`
3. `max_output_tokens`

`active-memory-updater`:

1. `prompt_path`
2. `max_recent_threads`
3. `max_output_tokens`
4. `debounce_ms`

## Dispatch Behavior

1. hook order follows manifest order,
2. event subscriptions are explicit via `events`,
3. wildcard `"*"` subscribes to all hook events,
4. failures are isolated and logged.
