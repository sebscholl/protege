# Changelog

## Unreleased

### Fixed

- OpenAI provider adapter now sends `max_completion_tokens` for reasoning-series models (o1, o3, o4) instead of `max_tokens`, which these models reject as unsupported.
- Tool loop now pushes skipped result messages for unprocessed tool calls after a mid-batch failure, preventing OpenAI from rejecting requests with orphaned `tool_call_id`s.
- Agent replies now thread correctly by inferring threading mode from recipient overlap instead of exposing `threadingMode`, `inReplyTo`, and `references` to the LLM. Replies to the original sender thread as replies; emails to new recipients start fresh threads.
