# Inference Harness

Harness is the reasoning and orchestration core for each run.

## Run Steps

1. build harness input from inbound message
2. assemble context (resolver pipeline or legacy fallback)
3. load selected provider adapter
4. run provider/tool loop
5. persist outbound response (unless suppressed by action policy)

## Context Assembly

Default path uses `configs/context.json` and resolver registry.

Context output structure:

```ts
export type HarnessContext = {
  threadId: string;
  activeMemory: string;
  systemSections?: string[];
  history: HarnessContextHistoryEntry[];
  input: HarnessInput;
};
```

Resolvers can contribute:

- `sections`
- `activeMemory`
- `history`
- `inputText`

## Provider + Tool Loop

`executeProviderToolLoop`:

- calls adapter `generate`
- if tool calls exist, executes tools and appends tool-result messages
- persists tool call/result events
- returns terminal text when no tool calls remain

Non-recoverable tool errors fail fast. Recoverable failures are wrapped and returned to the model as structured tool-result errors.

## Tool Trace Persistence

Harness persists tool traces into `thread_tool_events` with:

- `thread_id`
- `parent_message_id`
- `run_id`
- `step_index`
- `event_type`
- `tool_name`
- `tool_call_id`
- `payload_json`

These traces are reloaded by `thread-history` resolver for continuity.

## Provider Adapters

Runtime chooses adapter from `inference.provider` and provider config resolved from extension manifest + provider defaults.

Supported providers:

- OpenAI
- Anthropic
- Gemini
- Grok

All adapters implement the same normalized contract and error taxonomy.
