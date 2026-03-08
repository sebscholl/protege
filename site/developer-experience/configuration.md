# Config Files

All runtime behavior is controlled by JSON files in the `configs/` directory. This page documents every config surface.

## `configs/gateway.json` — Email Transport

Controls how Protege sends and receives email.

```json
{
  "mode": "default",
  "host": "127.0.0.1",
  "port": 2525,
  "mailDomain": "mail.protege.bot",
  "transport": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": true,
    "auth": {
      "user": "agent@example.com",
      "pass": "smtp-password"
    }
  },
  "relay": {
    "enabled": true,
    "relayWsUrl": "wss://relay.protege.bot/ws",
    "reconnectBaseDelayMs": 250,
    "reconnectMaxDelayMs": 8000,
    "heartbeatTimeoutMs": 30000
  },
  "attachmentLimits": {
    "maxAttachmentBytes": 10485760,
    "maxAttachmentsPerMessage": 10,
    "maxTotalAttachmentBytes": 26214400
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"dev"` or `"default"` | `dev` skips real email delivery for local testing |
| `host` | string | SMTP server bind address |
| `port` | integer (1-65535) | SMTP server bind port |
| `mailDomain` | string | Email domain for persona addresses (e.g., `mail.protege.bot`) |
| `transport` | object | Outbound SMTP settings (for local mode) |
| `relay` | object | Relay bridge settings |
| `attachmentLimits` | object | Per-message attachment size limits |

::: info Validation rule
If `relay.enabled` is `true`, `mailDomain` cannot be `localhost`.
:::

## `configs/inference.json` — LLM Settings

Controls which LLM provider and model your agent uses.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "max_output_tokens": 4096,
  "max_tool_turns": 8,
  "recursion_depth": 3
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | — | `openai`, `anthropic`, `gemini`, or `grok` |
| `model` | string | — | Provider-specific model name |
| `temperature` | number | — | Sampling temperature |
| `max_output_tokens` | number | — | Max tokens per LLM response |
| `max_tool_turns` | integer | `8` | Max tool-call rounds before forcing a text response |
| `recursion_depth` | number | `3` | Max agent-to-agent email reply depth (recursion guard) |

`recursion_depth` prevents infinite loops when agents email each other. Each outbound email carries an `X-Protege-Recursion` header that counts down. Messages arriving at 0 are rejected.

## `configs/security.json` — Access Policy

Controls who can send email to your agent.

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": [
      "alice@example.com",
      "*@trusted-company.com"
    ],
    "deny": [
      "spam@trusted-company.com"
    ]
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Whether to enforce access rules |
| `default_decision` | `"allow"` or `"deny"` | `"allow"` | What to do when no rule matches |
| `allow` | string[] | `[]` | Addresses/patterns to allow |
| `deny` | string[] | `[]` | Addresses/patterns to deny |

**Evaluation order:** deny rules → allow rules → default decision. Deny always wins if both match.

**Wildcards:** Use `*` for pattern matching. `*@example.com` matches any sender from that domain.

::: tip
This policy only applies to inbound gateway email. Local chat is not filtered.
:::

## `configs/system.json` — Runtime Settings

Controls logging, chat, and scheduler behavior.

```json
{
  "logs_dir_path": "tmp/logs",
  "console_log_format": "pretty",
  "theme_config_path": "configs/theme.json",
  "admin_contact_email": "admin@example.com",
  "chat": {
    "default_display_mode": "light",
    "poll_interval_ms": 1500,
    "keymap": {
      "send": "ctrl+s",
      "refresh": "ctrl+r",
      "toggle_display_mode": "ctrl+v",
      "quit": "ctrl+q",
      "move_selection_up": "up",
      "move_selection_down": "down",
      "open_thread": "enter",
      "back_to_inbox": "esc",
      "new_local_thread": "ctrl+n",
      "enter_compose_mode": "i"
    }
  },
  "scheduler": {
    "poll_interval_ms": 1000,
    "max_global_concurrent_runs": 5,
    "admin_contact_email": "ops@example.com"
  }
}
```

### Global settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `logs_dir_path` | string | `tmp/logs` | Where log files are written |
| `console_log_format` | `"json"` or `"pretty"` | `"json"` | Log output format |
| `theme_config_path` | string | `configs/theme.json` | Path to theme file |
| `admin_contact_email` | string | — | Email for failure alerts |

### Chat settings

| Field | Default | Description |
|-------|---------|-------------|
| `default_display_mode` | `"light"` | `"light"` (minimal) or `"verbose"` (full headers) |
| `poll_interval_ms` | `1500` | How often chat polls for new messages |
| `keymap` | — | Key bindings (see [Chat Guide](/reference/chat)) |

### Scheduler settings

| Field | Default | Description |
|-------|---------|-------------|
| `poll_interval_ms` | `1000` | How often the scheduler checks for queued runs |
| `max_global_concurrent_runs` | `5` | Max simultaneous responsibility runs |
| `admin_contact_email` | — | Override for scheduler-specific alerts |

## `configs/context.json` — Context Pipeline

Defines the resolver sequence for each inference run. See the [Resolvers](/developer-experience/extensions/resolvers) page for full documentation.

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

## `configs/theme.json` — Visual Theming

Controls colors for pretty log output and the chat TUI.

```json
{
  "pretty_logs": {
    "enabled": true,
    "indent": "\t",
    "header": {
      "timestamp": ["dim"],
      "level": ["bold"],
      "scope": ["cyan"],
      "event": ["magenta"]
    },
    "level": {
      "info": ["green"],
      "error": ["red"]
    },
    "context": {
      "key": ["blue"],
      "value": ["white"]
    }
  },
  "chat_ui": {
    "inbox": {
      "title_tag": ["bold", "blue-fg"],
      "timestamp_tag": ["dim", "gray-fg"],
      "selected_marker_tag": ["blue-fg"],
      "marker_glyph": "│"
    },
    "thread": {
      "title_tag": ["bold", "blue-fg"],
      "message_dot_glyph": "•",
      "message_header_tag": ["cyan-fg"]
    }
  }
}
```

Style tokens for `pretty_logs`: `bold`, `dim`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`.

## `prompts/system.md` — System Prompt

The base system prompt loaded into every inference run. This is the first piece of context the LLM sees (via the context pipeline).

```markdown
You are a helpful AI assistant. You communicate via email.

When you want to respond to the user, use the send_email tool with their
email address. Always be concise and helpful.

Available tools: shell, read_file, write_file, web_search, send_email.
```

If this file is missing, the system prompt contribution is empty.
