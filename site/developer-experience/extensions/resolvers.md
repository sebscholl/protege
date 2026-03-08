# Resolvers

Resolvers build the context that gets sent to the LLM before each inference run. They determine what your agent knows when it processes a message — the system prompt, persona instructions, conversation history, working memory, and the incoming message itself.

The resolver pipeline is defined in `configs/context.json` and runs in the exact order listed.

## How the Context Pipeline Works

When your agent receives a message, the harness runs each resolver in sequence. Each one contributes a piece of context:

```
configs/context.json
  │
  ├─ load-file(prompts/system.md)              → Base system instructions
  ├─ load-file(personas/{persona_id}/PERSONA.md) → Persona-specific behavior
  ├─ load-file(memory/{persona_id}/active.md)  → Working memory
  ├─ thread-memory-state                       → Thread-level memory
  ├─ thread-history                            → Recent conversation messages
  ├─ load-file(personas/{persona_id}/knowledge/CONTENT.md) → Reference docs
  ├─ invocation-metadata                       → Email routing context
  └─ current-input                             → The actual incoming message
      │
      ▼
  Assembled context → sent to LLM
```

## Context Profiles

`configs/context.json` defines two profiles — one for email/chat messages and one for scheduled tasks:

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

**`thread` profile** is used for email and chat messages — it includes conversation history and routing metadata.

**`responsibility` profile** is used for scheduled tasks — no conversation history since there's no incoming thread.

### Step syntax

Each step is a resolver name, optionally with arguments:

```
resolver-name                    # No arguments
resolver-name(arg1, arg2)        # Positional string arguments
load-file(prompts/system.md)     # Load a specific file
```

Arguments are passed to the resolver as `resolverArgs: string[]`. Placeholders like `{persona_id}` are expanded from the invocation context.

## Built-In Resolvers

### `load-file`

Reads a file and adds its content as a system section. This is the most commonly used resolver — it loads your system prompt, persona instructions, and knowledge files.

```
load-file(prompts/system.md)
load-file(personas/{persona_id}/PERSONA.md)
load-file(memory/{persona_id}/active.md)
```

Behavior:
- The first argument is the file path (relative to the workspace root)
- `{persona_id}` and other placeholders are expanded from the invocation context
- If the file doesn't exist, the resolver silently contributes nothing (no error)

### `thread-history`

Loads the conversation history for the current thread from the SQLite database. This includes:
- Previous inbound and outbound messages
- Tool call and tool result events (so the LLM sees what tools were used previously)

History is trimmed to fit within a token budget (default: 1200 tokens) to avoid overwhelming the context window.

### `invocation-metadata`

Adds email routing context to help the LLM use the `send_email` tool correctly. The context looks like:

```
Inbound email routing context:
- message_id: <abc123@mail.example.com>
- thread_id: thread_xyz
- reply_to_default: alice@example.com
- reply_from_address: agent@mail.protege.bot
- from: alice@example.com
- to: agent@mail.protege.bot
- cc: bob@example.com
```

Without this, the LLM wouldn't know who sent the message or where to send replies.

### `current-input`

Maps the incoming message body into the final user message in the context pipeline. This is always the last resolver in the chain — it's the actual message your agent needs to respond to.

### `thread-memory-state`

A placeholder resolver for thread-level memory state. Currently returns `null` — the memory chain operates through hooks rather than a resolver.
