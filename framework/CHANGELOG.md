# Changelog

## 0.0.1-alpha.6 — 2026-04-09

### Fixed

- `normalizeMessageId` no longer lowercases Message-IDs. The original case is preserved in storage and outbound headers (In-Reply-To, References), fixing broken Gmail threading where replies started new threads instead of continuing the original conversation.

## 0.0.1-alpha.5 — 2026-04-08

### Fixed

- Email thread ID derivation now anchors on the root (first) reference in the RFC 5322 `References` header instead of the last. Previously, each reply in a multi-party thread produced a different thread ID, fragmenting a single conversation into many separate threads in the database and chat UI.

## 0.0.1-alpha.4 — 2026-03-25

### Fixed

- OpenAI provider adapter now sends `max_completion_tokens` for reasoning-series models (o1, o3, o4) instead of `max_tokens`, which these models reject as unsupported.
- Tool loop now pushes skipped result messages for unprocessed tool calls after a mid-batch failure, preventing OpenAI from rejecting requests with orphaned `tool_call_id`s.
- Agent replies now thread correctly by inferring threading mode from recipient overlap instead of exposing `threadingMode`, `inReplyTo`, and `references` to the LLM. Replies to the original sender thread as replies; emails to new recipients start fresh threads.
- Chat thread view no longer renders the empty seed message as a duplicate `user@localhost` block when starting a new thread.
- Chat status bar now shows the active model name alongside the status message.

### Changed

- `edit_file` tool now uses line-range replacement (`startLine`, `endLine`, `content`) instead of literal substring matching. Eliminates whitespace, escape, and newline matching issues.

### Added

- `scripts/dev-chat.sh` — launches a local dev chat session against a temporary workspace without conflicting with a live agent.
