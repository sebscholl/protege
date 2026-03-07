# Built-In Resolvers

Built-ins enabled by default in `extensions/extensions.json`:

1. `load-file`
2. `thread-memory-state`
3. `invocation-metadata`
4. `thread-history`
5. `current-input`

## Context Profiles

Source: `configs/context.json`

```json
{
  "thread": [
    "load-file(prompts/system.md)",
    "load-file(personas/{persona_id}/PERSONA.md)",
    "load-file(memory/{persona_id}/active.md)",
    "thread-memory-state",
    "thread-history",
    "load-file(personas/{persona_id}/knowledge/CONTENT.md)",
    "invocation-metadata",
    "current-input"
  ],
  "responsibility": [
    "load-file(prompts/system.md)",
    "load-file(personas/{persona_id}/PERSONA.md)",
    "load-file(memory/{persona_id}/active.md)",
    "load-file(personas/{persona_id}/knowledge/CONTENT.md)",
    "current-input"
  ]
}
```

## Resolver Call Syntax

From `engine/harness/context/config.ts`:

1. `resolver-name`
2. `resolver-name(arg1, arg2)`

Arguments are parsed as positional strings and passed as `resolverArgs`.

## Built-In Behavior

`load-file`:

1. reads one path from first positional arg,
2. expands `{placeholder}` from invocation context,
3. resolves relative paths from workspace root.

`thread-history`:

1. loads message + tool-event timeline from SQLite,
2. trims history by token budget (`maxHistoryTokens`).

`invocation-metadata`:

1. adds routing note (`from`, `to`, `cc`, `bcc`, references, reply defaults),
2. helps model call `send_email` with concrete addresses.

`current-input`:

1. maps current inbound body to terminal input text in the context pipeline.

`thread-memory-state`:

1. placeholder resolver in current implementation (`null`).

## Configure Resolver Entries

```json
{
  "resolvers": [
    "load-file",
    {
      "name": "thread-history",
      "config": {
        "maxHistoryTokens": 2400
      }
    }
  ]
}
```
