# Config

Extension Surface: Yes

This directory contains user-editable runtime behavior configuration.

Includes model/provider settings and prompts. It should not contain runtime-generated state.

Current top-level config files:

1. `gateway.json` for SMTP gateway runtime behavior.
2. `gateway.example.json` as a copy-ready gateway config template.
3. `inference.json` for harness/provider behavior.
4. `system.json` for global runtime behavior (for example unified log path).

Inference config includes provider-specific credentials:

1. `providers.openai.api_key_env`
2. Future providers follow the same `providers.{provider}.api_key_env` shape.
3. Credentials are resolved from process environment variables loaded from `.env`, `.env.local`, or shell env.

Gateway config includes attachment safety limits:

1. `attachmentLimits.maxAttachmentBytes`
2. `attachmentLimits.maxAttachmentsPerMessage`
3. `attachmentLimits.maxTotalAttachmentBytes`

Gateway config supports optional relay-client runtime mode:

1. `relay.enabled`
2. `relay.relayWsUrl`
3. `relay.reconnectBaseDelayMs`
4. `relay.reconnectMaxDelayMs`
5. `relay.heartbeatTimeoutMs`

Example `config/gateway.json` relay block:

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

Relay field behavior:

1. `relay.enabled`: Starts one relay websocket client per local persona.
2. `relay.relayWsUrl`: Relay websocket endpoint used for auth and SMTP tunneling.
3. `relay.reconnectBaseDelayMs`: Initial reconnect delay after disconnect.
4. `relay.reconnectMaxDelayMs`: Maximum reconnect delay cap during exponential backoff.
5. `relay.heartbeatTimeoutMs`: Idle timeout before forcing reconnect if relay traffic stops.

System config includes unified runtime logging path:

1. `logs_dir_path`
2. `console_log_format` (`json` or `pretty`)

System config also includes chat session defaults:

1. `chat.default_display_mode` (`light` or `verbose`)
2. `chat.poll_interval_ms` (positive integer)
3. `chat.keymap` required bindings:
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
