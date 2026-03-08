# Chat Guide

`protege chat` is a terminal-based inbox client for interacting with your agent locally. It doesn't introduce a new protocol — every message is stored as email-thread data in the persona's database, just like real email conversations.

## Starting Chat

```bash
# Open the unified inbox (all personas)
protege chat

# Filter to one persona
protege chat --persona 5d52

# Jump directly to a specific thread
protege chat --thread thread_abc123
```

## Views

### Inbox View

The inbox shows all known threads across selected personas:

```
│ Research Assistant — Weekly Report
│ 2 minutes ago · alice@example.com
│ Here's your weekly summary...
│
  DevOps Bot — Server Alert
  15 minutes ago · ops@example.com
  All systems operational...
```

The blue bar (`│`) marks the selected thread.

### Thread View

Press `Enter` to open a thread and see the full conversation:

```
• alice@example.com — 10:30 AM
  Can you research the latest Node.js release?

• agent@mail.protege.bot — 10:31 AM
  Node.js v22.x is the current LTS release...
```

## Keybindings

### Inbox

| Key | Action |
|-----|--------|
| `Up` / `Down` | Move selection |
| `Enter` | Open selected thread |
| `Ctrl+N` | Create a new writable thread |
| `Ctrl+V` | Toggle light/verbose display mode |
| `Ctrl+R` | Refresh inbox |
| `Ctrl+Q` | Quit |

### Thread (Command Mode)

| Key | Action |
|-----|--------|
| `Esc` | Back to inbox |
| `i` | Enter compose mode |
| `Up` / `Down` | Scroll thread |
| `PageUp` / `PageDown` | Fast scroll |

### Thread (Compose Mode)

| Key | Action |
|-----|--------|
| `Ctrl+S` | Send message |
| `Left` / `Right` | Move cursor |
| `Home` / `End` | Jump to start/end of line |
| `Backspace` / `Delete` | Delete characters |
| `Esc` | Back to command mode |

All keybindings are customizable in `configs/system.json` under `chat.keymap`.

## Sending Messages

1. Press `Ctrl+N` to create a new writable thread
2. Press `i` to enter compose mode
3. Type your message
4. Press `Ctrl+S` to send

When you send:
1. Your message is persisted immediately in the database
2. Harness inference runs asynchronously
3. The agent's reply appears in the same thread once inference completes

Chat polls for new messages at the interval set in `configs/system.json` (`chat.poll_interval_ms`, default: 1500ms).

## Display Modes

Toggle between modes with `Ctrl+V`:

- **Light** — shows sender and message body only
- **Verbose** — shows full email headers (from, to, subject, date, message ID) for each message

## Local Addressing

Chat uses synthetic local email addresses:

- **Your messages** appear as `user@localhost`
- **Agent responses** appear as `{persona_email_local_part}@localhost`

This means chat threads are locally scoped — they don't go through the relay or real SMTP.

## Logging

Chat writes structured events to the log file (configured in `configs/system.json` → `logs_dir_path`) without cluttering the TUI:

```bash
protege logs --scope chat --tail 100
```

## Current Limitations

- **Existing threads are read-only** — only threads created inside chat (`Ctrl+N`) can receive new messages
- **Poll-based updates** — chat polls for new messages rather than receiving push updates
- **No attachment UI** — composing messages with attachments isn't supported in chat v1
