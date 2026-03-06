# Chat Guide

`protege chat` is a terminal inbox for one persona. It does not introduce a new protocol. Every interaction is stored as email-thread data in persona memory.

## Start Chat

1. Open chat for one persona:
```bash
protege chat --persona <persona_id_or_prefix>
```
2. Open chat and jump directly to one thread:
```bash
protege chat --persona <persona_id_or_prefix> --thread <thread_id>
```

## Mental Model

1. Inbox view: list of known threads for the selected persona.
2. Thread view: one thread conversation.
3. Existing threads: read-only in v1.
4. Writable threads: only threads created inside chat (`Ctrl+N`).

This keeps v1 recipient handling deterministic and safe.

## Modes

Thread view has two interaction modes:

1. `COMPOSE`: typing edits the draft.
2. `COMMAND`: typing does not append to the draft.

The status line shows current mode, active key event, and recent status.

## Keybindings (Default)

Inbox:

1. `Up` / `Down`: move selection.
2. `Enter`: open selected thread.
3. `Ctrl+N`: create a writable local chat thread.
4. `Ctrl+V`: toggle `light` / `verbose` display mode.
5. `Ctrl+R`: refresh.
6. `Ctrl+Q`: quit.

Thread:

1. `Esc`: back to inbox (or leave compose mode).
2. `i`: enter compose mode from command mode.
3. `Ctrl+S`: send draft.
4. `Ctrl+Enter`: legacy send fallback (terminal-dependent).
5. `Up` / `Down`: scroll thread.
6. `PageUp` / `PageDown`: fast scroll.
7. `Ctrl+U` / `Ctrl+D`: fast scroll alternative.

All chat keybindings are configurable in `configs/system.json` under `chat.keymap`.

## Sending Behavior

1. On submit (`Ctrl+S`), the local user message is persisted immediately.
2. Chat auto-scrolls to bottom immediately on submit.
3. Harness inference runs asynchronously.
4. Tool-driven reply is persisted in the same thread.
5. Chat auto-scrolls to bottom again when the response lands.

## Display Modes

1. `light`: sender + body focused.
2. `verbose`: full email envelope metadata (from/to/subject/date/message-id) per message.

Toggle with `Ctrl+V`.

## Local Identity in Chat

Writable local chat threads use synthetic local addressing:

1. User side: `user@localhost`
2. Persona side: `<persona_email_local_part>@localhost`

This local path is intended for terminal workflows and debugging.

## Logging

Chat writes structured events to `tmp/logs/protege.log` (or configured `logs_dir_path`) without printing runtime logs into the TUI surface.

Use:

```bash
protege logs --scope chat --tail 200
```

## Current v1 Limits

1. Existing (non-chat-created) threads are read-only in chat.
2. Chat is poll-based, not push-updated.
3. Rich attachment compose UI is not part of chat v1.
