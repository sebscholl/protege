# Chat Guide

`protege chat` is a terminal inbox client. It does not introduce a new protocol. Every interaction is stored as email-thread data in persona memory.

## Start Chat

1. Open chat with a unified inbox across personas:
```bash
protege chat
```
2. Open chat filtered to one persona:
```bash
protege chat --persona <persona_id_or_prefix>
```
3. Open chat and jump directly to one thread:
```bash
protege chat --thread <thread_id>
```

## Mental Model

1. Inbox view: list of known threads across selected persona scope.
2. Thread view: one thread conversation.
3. Existing threads: read-only in v1.
4. Writable threads: only threads created inside chat (`Ctrl+N`).

## Modes

Thread view has two interaction modes:

1. `COMPOSE`: typing edits the draft.
2. `COMMAND`: typing does not append to the draft.

## Keybindings (Default)

Inbox:

1. `Up` / `Down`: move selection.
2. `Enter`: open selected thread.
3. `Ctrl+N`: create a writable local chat thread.
4. `Ctrl+V`: toggle `light` / `verbose` display mode.
5. `Ctrl+R`: refresh.
6. `Ctrl+Q`: quit.

Thread:

1. `Esc`: back to inbox.
2. `i`: enter compose mode from command mode.
3. `Ctrl+S`: send draft.
4. `Ctrl+Enter`: legacy send fallback (terminal-dependent).
5. `Up` / `Down`: scroll thread.
6. `PageUp` / `PageDown`: fast scroll.
7. `Ctrl+U` / `Ctrl+D`: fast scroll alternative.

All chat keybindings are configurable in `configs/system.json` under `chat.keymap`.

## Sending Behavior

1. On submit (`Ctrl+S`), the local user message is persisted immediately.
2. Harness inference runs asynchronously.
3. Tool-driven reply is persisted in the same thread.

## Display Modes

1. `light`: sender + body focused.
2. `verbose`: full email envelope metadata (from/to/subject/date/message-id) per message.

Toggle with `Ctrl+V`.

## Local Identity in Chat

Writable local chat threads use synthetic local addressing:

1. User side: `user@localhost`
2. Persona side: `<persona_email_local_part>@localhost`

## Logging

Chat writes structured events to `tmp/logs/protege.log` (or configured `logs_dir_path`) without printing runtime logs into the TUI surface.

```bash
protege logs --scope chat --tail 200
```

## Current v1 Limits

1. Existing (non-chat-created) threads are read-only in chat.
2. Chat is poll-based, not push-updated.
3. Rich attachment compose UI is not part of chat v1.
