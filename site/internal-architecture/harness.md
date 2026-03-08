# Inference Harness

The harness is the reasoning core. It assembles context, calls the LLM, executes tools, and persists results. Every email reply and every scheduled task goes through the harness.

## Run Lifecycle

When the gateway dispatches an inference run, the harness executes these steps:

1. **Build harness input** — normalize the inbound message into a standard input shape
2. **Assemble context** — run the resolver pipeline from `configs/context.json`
3. **Load provider adapter** — select and configure the LLM adapter based on `configs/inference.json`
4. **Execute the tool loop** — call the LLM, execute any tool calls, repeat until a final text response
5. **Persist the response** — store the outbound message in the persona's database

### Context Assembly

The context pipeline runs each resolver in order and builds a structured context:

```ts
{
  threadId: string;          // Current conversation thread
  activeMemory: string;      // Contents of active.md
  systemSections: string[];  // System prompt + persona instructions + knowledge
  history: HistoryEntry[];   // Previous messages and tool traces
  input: {                   // The current message
    messageId: string;
    text: string;
    metadata: { ... };       // Email routing context (from, to, cc, etc.)
  };
}
```

This context is then converted into provider messages:
- `systemSections` → a `system` message
- `history` entries → alternating `user`/`assistant` messages
- `input.text` → the final `user` message

### The Tool Loop

`executeProviderToolLoop` is the core inference cycle:

```
┌───────────────────────────────────────┐
│ 1. Send messages + tools to LLM      │
│ 2. LLM responds                      │
│    ├── Text only → return (done)     │
│    └── Tool calls → execute each     │
│        ├── Success → append result   │
│        └── Failure → append error    │
│ 3. Loop back to step 1              │
│ 4. Fail if max_tool_turns exceeded  │
└───────────────────────────────────────┘
```

Key behaviors:

- **Tool failures are recoverable** — if a tool throws, the error is wrapped as a structured result (`{ ok: false, error: { ... } }`) and fed back to the LLM. The model gets a chance to adjust its approach.
- **Some failures are terminal** — "tool not found", "unsupported runtime action", and "outbound transport not configured" errors immediately stop the run.
- **Tool traces are persisted** — every tool call and result is recorded in `thread_tool_events` for debugging and history replay.
- **The loop is bounded** — `max_tool_turns` (default: 8) prevents runaway tool chains.

## Tool Trace Persistence

During each run, tool calls and results are stored in the `thread_tool_events` table:

| Column | Description |
|--------|-------------|
| `thread_id` | Which conversation thread |
| `parent_message_id` | Which inbound message triggered this run |
| `run_id` | Unique ID for this inference run |
| `step_index` | Sequential step number within the run |
| `event_type` | `tool_call` or `tool_result` |
| `tool_name` | Which tool was called |
| `tool_call_id` | Provider-assigned call ID |
| `payload_json` | The call input or result payload |

These traces are loaded by the `thread-history` resolver so that subsequent inference runs can see what tools were used previously.

## Provider Adapter Selection

The harness selects a provider adapter based on `configs/inference.json`:

1. Read `provider` and `model` from config → form a model ID like `anthropic/claude-sonnet-4-20250514`
2. Resolve provider runtime config from the extension manifest + provider defaults
3. Resolve the API key from environment variables
4. Create the adapter (OpenAI, Anthropic, Gemini, or Grok)

All adapters implement the same `HarnessProviderAdapter` contract, so the rest of the harness is completely provider-agnostic.

## Source Files

| File | Purpose |
|------|---------|
| `engine/harness/runtime.ts` | Main run logic, tool loop, provider messages |
| `engine/harness/context/pipeline.ts` | Context assembly from resolver chain |
| `engine/harness/context/config.ts` | Context pipeline config parsing |
| `engine/harness/context/history.ts` | Thread history loading and trimming |
| `engine/harness/providers/registry.ts` | Provider config resolution |
| `engine/harness/tools/registry.ts` | Tool loading and execution |
| `engine/harness/hooks/registry.ts` | Hook dispatch |
| `engine/harness/storage.ts` | Message and tool trace persistence |
