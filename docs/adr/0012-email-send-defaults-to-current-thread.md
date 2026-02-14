# ADR 0012: `email.send` Defaults to Current-Thread Replies

- Date: 2026-02-14
- Status: Accepted
- Technical Story: Ensure deterministic inbox threading for tool-driven outbound replies

## Context

Tool-driven outbound email can include optional threading fields (`inReplyTo`, `references`, custom subject). When these are left unconstrained, providers may generate replies that appear as separate conversations, especially in Gmail.

Protege needs reliable default behavior for normal reply flows while preserving an explicit way to start a new thread intentionally.

## Decision

1. Runtime action `email.send` defaults to `reply_current` threading mode.
2. In `reply_current` mode, gateway enforces:
   - `inReplyTo = inbound.messageId`
   - `references = inbound.references`
   - reply subject normalization from inbound subject (`Re: ...`)
3. `threadingMode: "new_thread"` is the explicit opt-in escape hatch for intentional thread breaks.
4. Tool schema and runtime context documentation must describe this default clearly.

## Consequences

Positive:

1. Normal user replies remain grouped in the same email thread by default.
2. Threading behavior is deterministic and no longer depends on model/tool prompt drift.
3. Intentional new-thread behavior remains available via one explicit control.

Tradeoffs:

1. Model-provided custom threading fields are ignored in default mode.
2. Tool callers must use `threadingMode: "new_thread"` for non-reply flows.

## Alternatives Considered

1. Prompt-only guidance to models:
   - low implementation cost, but too fragile for deterministic UX.
2. Allow all tool-provided threading fields by default:
   - flexible, but causes frequent accidental thread forks.
3. Remove thread-break capability entirely:
   - simple, but blocks legitimate workflows that need new conversations.
