# Config

Extension Surface: Yes

This directory contains user-editable runtime behavior configuration.

Includes model/provider settings and prompts. It should not contain runtime-generated state.

Current top-level config files:

1. `gateway.json` for SMTP gateway runtime behavior.
2. `inference.json` for harness/provider behavior.
3. `system.json` for global runtime behavior (for example unified log path).
4. `system-prompt.md` for the base system prompt text.

## `gateway.json`

Required fields:

1. `mode`: `"dev"` or `"default"`.
2. `host`: non-empty string.
3. `port`: integer in `1..65535`.
4. `mailDomain`: lowercase domain string.  
When `relay.enabled = true`, `mailDomain` must not be `localhost`.

Optional fields:

1. `transport` object:
   1. `host`: non-empty string.
   2. `port`: integer in `1..65535`.
   3. `secure`: boolean.
   4. `auth` object:
      1. `user`: non-empty string.
      2. `pass`: non-empty string.
2. `relay` object:
   1. `enabled`: boolean.
   2. `relayWsUrl`: `ws://...` or `wss://...`.
   3. `reconnectBaseDelayMs`: positive integer.
   4. `reconnectMaxDelayMs`: positive integer.
   5. `heartbeatTimeoutMs`: positive integer.
3. `attachmentLimits` object:
   1. `maxAttachmentBytes`
   2. `maxAttachmentsPerMessage`
   3. `maxTotalAttachmentBytes`

## `inference.json`

Required fields:

1. `provider`: currently `openai | anthropic | gemini | grok`.
2. `model`: provider model id string.

Optional fields:

1. `recursion_depth`: number (default `3`).
2. `whitelist`: string array (default `[]`).
3. `temperature`: number.
4. `max_output_tokens`: number.
5. `max_tool_turns`: positive integer max provider/tool loop turns per run (default `8`).
6. `providers` object:
   1. `openai`:
      1. `api_key_env`: env var key name (recommended).
      2. `api_key`: literal API key (legacy fallback).
      3. `base_url`: optional override base URL.
   2. `anthropic`:
      1. `api_key_env`
      2. `api_key` (legacy fallback)
      3. `base_url`: optional override base URL.
      4. `version`: optional override for `anthropic-version` request header (default `2023-06-01`).
   3. `gemini`:
      1. `api_key_env`
      2. `api_key` (legacy fallback)
      3. `base_url`: optional override base URL.
   4. `grok`:
      1. `api_key_env`
      2. `api_key` (legacy fallback)
      3. `base_url`: optional override base URL.

Credential resolution order per provider:

1. `providers.{provider}.api_key` when set.
2. `providers.{provider}.api_key_env` resolved from process env when set.
3. otherwise undefined (doctor/runtime will fail for selected provider).

## `system.json`

Global fields:

1. `logs_dir_path`: string path (default `tmp/logs`).
2. `console_log_format`: `json | pretty` (default `json` when missing).
3. `admin_contact_email`: optional email for runtime failure alerts.

`chat` fields:

1. `default_display_mode`: `light | verbose` (default `light`).
2. `poll_interval_ms`: positive integer (default `1500`).
3. `keymap` object required keys:
   1. `send`
   2. `refresh`
   3. `toggle_display_mode`
   4. `quit`
   5. `move_selection_up`
   6. `move_selection_down`
   7. `open_thread`
   8. `back_to_inbox`
   9. `new_local_thread`
   10. `enter_compose_mode`

`scheduler` fields:

1. `poll_interval_ms`: positive integer (default `1000`).
2. `max_global_concurrent_runs`: positive integer (default `5`).
3. `admin_contact_email`: optional scheduler-local override.

## Secrets and Env

`config/` is canonical non-secret config. Secrets belong in process env (`.env`, `.env.local`, or shell env).

The current `.env.example` keys are:

1. `OPENAI_API_KEY`
2. `ANTHROPIC_API_KEY`
3. `GEMINI_API_KEY`
4. `GROK_API_KEY`
5. `PERPLEXITY_API_KEY`
6. `TAVILY_API_KEY`

## Relay Example

```json
{
  "relay": {
    "enabled": true,
    "relayWsUrl": "ws://127.0.0.1:8080/ws",
    "reconnectBaseDelayMs": 250,
    "reconnectMaxDelayMs": 8000,
    "heartbeatTimeoutMs": 30000
  }
}
```
