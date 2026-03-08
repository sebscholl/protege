# Hooks

Hooks are event observers that react to things happening in the runtime — an inference run completing, a tool call failing, a scheduled task finishing. They run asynchronously and never block the main request flow.

The most common use for hooks is **memory synthesis**: after every inference run, hooks summarize the conversation and update your agent's working memory.

## Built-In Hooks

Protege ships with two hooks that form the memory synthesis chain:

### `thread-memory-updater`

Listens to `harness.inference.completed`. After each inference run, it generates a summary of the conversation thread and persists it.

### `active-memory-updater`

Listens to `memory.thread.updated` (emitted by `thread-memory-updater`). It reads the latest thread summaries and refreshes `memory/{persona_id}/active.md` — the short-horizon working memory that's loaded into every inference run.

Together, they form a chain:

```
Inference completes
  → thread-memory-updater summarizes the thread
    → emits memory.thread.updated
      → active-memory-updater refreshes active.md
```

### Default manifest configuration

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

### Configuration keys

**`thread-memory-updater`:**

| Key | Description | Default |
|-----|-------------|---------|
| `prompt_path` | Path to the summarization prompt | `prompts/thread-summary.md` |
| `max_delta_items` | Max thread entries to include | `24` |
| `max_output_tokens` | Token limit for the summary | `800` |

**`active-memory-updater`:**

| Key | Description | Default |
|-----|-------------|---------|
| `prompt_path` | Path to the synthesis prompt | `prompts/active-summary.md` |
| `max_recent_threads` | How many recent threads to consider | `6` |
| `max_output_tokens` | Token limit for active memory | `600` |
| `debounce_ms` | Debounce window for rapid updates | `0` |

## Event System

Hooks subscribe to specific runtime events. The engine emits events at key moments across the gateway, harness, scheduler, and memory subsystems.

### Hook dispatch behavior

1. Hooks are called in **manifest order**
2. Each hook only receives events listed in its `events` array
3. Using `"*"` subscribes to all events (useful for logging/debugging hooks)
4. Hook failures are **isolated** — a failing hook doesn't crash the run

### Event reference

Events are organized by subsystem. Every event payload includes these base fields:

```ts
{
  level: 'info' | 'error',   // Severity
  scope: string,              // Subsystem (e.g., "gateway", "scheduler")
  event: string,              // Event name
  timestamp: string,          // ISO 8601 timestamp
}
```

Plus event-specific fields like `personaId`, `threadId`, `toolName`, etc.

#### Gateway events

| Event | Description |
|-------|-------------|
| `gateway.inbound.received` | Raw SMTP data received |
| `gateway.inbound.parsed` | Message parsed and persona routed |
| `gateway.inbound.enqueued` | Message queued for inference |
| `gateway.outbound.sending` | Sending outbound email |
| `gateway.outbound.sent` | Outbound email delivered |
| `gateway.outbound.queued_via_relay` | Outbound queued through relay |
| `gateway.outbound.sent_via_relay` | Outbound delivered through relay |
| `gateway.relay.authenticated` | WebSocket auth succeeded |
| `gateway.relay.disconnected` | Relay connection lost |
| `gateway.error` | Unhandled gateway error |

#### Harness events

| Event | Description |
|-------|-------------|
| `harness.inbound.persisted` | Inbound message stored |
| `harness.inference.started` | Inference run beginning |
| `harness.inference.completed` | Inference run finished |
| `harness.tool.calls.received` | LLM requested tool calls |
| `harness.tool.call.started` | Single tool execution starting |
| `harness.tool.call.completed` | Single tool execution succeeded |
| `harness.tool.call.failed` | Single tool execution failed |

#### Scheduler events

| Event | Description |
|-------|-------------|
| `scheduler.sync.completed` | Responsibility sync finished |
| `scheduler.cron.enqueued` | Cron tick queued a run |
| `scheduler.cron.skipped_overlap` | Skipped — previous run still active |
| `scheduler.run.claimed` | Run claimed by runner |
| `scheduler.run.started` | Run execution began |
| `scheduler.run.completed` | Run succeeded |
| `scheduler.run.failed` | Run failed |

#### Memory events

| Event | Description |
|-------|-------------|
| `memory.thread.updated` | Thread memory summary updated |
| `memory.active.updated` | Active memory file refreshed |

### Event payload example

Here's what a `harness.tool.call.failed` event looks like:

```json
{
  "level": "error",
  "scope": "gateway",
  "event": "harness.tool.call.failed",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "correlationId": "persona:thread:message",
  "toolName": "send_email",
  "toolCallId": "call_abc123",
  "message": "No recipients defined",
  "errorName": "Error"
}
```
