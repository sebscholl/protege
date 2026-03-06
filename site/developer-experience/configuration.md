# Config Files

This page covers every file under `configs/` currently used by runtime.

## `configs/gateway.json`

Runtime loader: `readGatewayRuntimeConfig` (`engine/gateway/index.ts`).

### Required fields

- `mode`: `"dev" | "default"`
- `host`: non-empty string
- `port`: integer `1..65535`
- `mailDomain`: lowercase domain-like string (`[a-z0-9.-]+`, not starting/ending with `.`)

### Optional sections

- `transport`
  - `host`: string
  - `port`: integer `1..65535`
  - `secure`: boolean
  - `auth` optional object
    - `user`: string
    - `pass`: string
- `attachmentLimits`
  - `maxAttachmentBytes`: positive integer
  - `maxAttachmentsPerMessage`: positive integer
  - `maxTotalAttachmentBytes`: positive integer
- `relay`
  - `enabled`: boolean
  - `relayWsUrl`: string starting with `ws://` or `wss://`
  - `reconnectBaseDelayMs`: positive integer
  - `reconnectMaxDelayMs`: positive integer
  - `heartbeatTimeoutMs`: positive integer

### Validation rule

If `relay.enabled` is `true`, `mailDomain` must not be `localhost`.

## `configs/inference.json`

Runtime loader: `readInferenceRuntimeConfig` (`engine/harness/config.ts`).

### Required fields

- `provider`: `openai | anthropic | gemini | grok`
- `model`: provider-specific model name (without provider prefix)

### Optional fields

- `recursion_depth`: number (default fallback: `3`)
- `max_tool_turns`: positive integer (default fallback: `8`)
- `temperature`: number
- `max_output_tokens`: number

`recursion_depth` is used by gateway email recursion headers (`X-Protege-Recursion`) for agent-to-agent loop bounding.

Provider credential and endpoint config are loaded from `extensions/extensions.json -> providers` plus provider-local defaults.

## `configs/security.json`

Runtime loader: `readSecurityRuntimeConfig` (`engine/shared/security-config.ts`).

### Schema

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "allow",
    "allow": [],
    "deny": []
  }
}
```

### Evaluation order

1. deny rules
2. allow rules
3. default decision

Wildcard match uses `*` and is case-insensitive after normalization.

Scope: gateway inbound sender filtering only. Local chat is not filtered by this policy.

## `configs/system.json`

Runtime loader: `readGlobalRuntimeConfig` (`engine/shared/runtime-config.ts`).

### Global fields

- `logs_dir_path`: string path
- `console_log_format`: `"json" | "pretty"`
- `theme_config_path`: optional path to theme file (defaults to `configs/theme.json`)
- `admin_contact_email`: optional global failure alert target

### `chat`

- `default_display_mode`: `"light" | "verbose"`
- `poll_interval_ms`: positive integer
- `keymap`: required key-action map with keys:
  - `send`
  - `refresh`
  - `toggle_display_mode`
  - `quit`
  - `move_selection_up`
  - `move_selection_down`
  - `open_thread`
  - `back_to_inbox`
  - `new_local_thread`
  - `enter_compose_mode`
  - `scroll_thread_up`
  - `scroll_thread_down`
  - `scroll_thread_page_up`
  - `scroll_thread_page_down`
  - `compose_cursor_left`
  - `compose_cursor_right`
  - `compose_cursor_home`
  - `compose_cursor_end`
  - `compose_delete_backward`
  - `compose_delete_forward`

### `scheduler`

- `poll_interval_ms`: positive integer
- `max_global_concurrent_runs`: positive integer
- `admin_contact_email`: optional scheduler-local override

## `configs/context.json`

Runtime loader: `readContextPipelineConfig` (`engine/harness/context/config.ts`).

### Profiles

- `thread`: ordered resolver steps for email/chat turns
- `responsibility`: ordered resolver steps for scheduler turns

### Step format

- `resolver-name`
- `resolver-name(arg1, arg2, arg3)`

Resolver names validate against `[a-zA-Z0-9._-]+`.

Arguments are positional string values passed as `resolverArgs`.

Current scaffolded values:

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

## `prompts/system.md`

Loaded by harness via `loadSystemPrompt`. If missing, system prompt contribution is empty.

Also commonly loaded via context pipeline `load-file(prompts/system.md)`.

## `configs/theme.json`

Runtime loader: theme parsing in `engine/shared/runtime-config.ts`.

### Sections

- `pretty_logs`
  - `enabled`, `indent`, `header`, `level`, `context`
- `chat_ui`
  - `inbox`
  - `status`
  - `thread`

Theme token arrays map to style names interpreted by logger/TUI formatting code.

## Minimal Example Bundle

```ts
export const gatewayConfig = {
  mode: 'dev',
  host: '127.0.0.1',
  port: 2525,
  mailDomain: 'localhost',
  relay: {
    enabled: false,
    relayWsUrl: 'ws://127.0.0.1:8080/ws',
    reconnectBaseDelayMs: 250,
    reconnectMaxDelayMs: 8000,
    heartbeatTimeoutMs: 30000,
  },
};
```
