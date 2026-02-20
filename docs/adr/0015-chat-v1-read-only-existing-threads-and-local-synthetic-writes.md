# ADR 0015: Chat v1 Uses Read-Only Existing Threads and Writable Local Synthetic Threads

- Date: 2026-02-19
- Status: Accepted
- Technical Story: Remove recipient ambiguity and keep first chat iteration safe and deterministic

## Context

In `protege chat`, sending from arbitrary existing threads introduces ambiguity about recipients and higher risk of accidental outbound behavior. We need a safe v1 write path that preserves email semantics while keeping UX simple and deterministic.

## Decision

1. Existing threads opened in chat are read-only in v1.
2. Writable interaction in v1 is limited to TUI-created local synthetic threads.
3. New thread creation happens inside chat (not through a separate CLI command).
4. Local synthetic thread bootstrap uses:
   - `from = user@localhost`
   - `to = persona current mailbox identity`
   - `subject = Local Chat <timestamp>`
   - synthetic message-id
5. Local synthetic inbound message is persisted and enqueued through the existing async inbound->harness pipeline.
6. Harness/tool-driven replies for these local threads target `user@localhost`.

## Consequences

Positive:

1. No recipient ambiguity for writable chat sessions.
2. Lower risk of accidental outbound sends to external recipients in v1.
3. Reuses existing email-thread pipeline and persistence model.

Tradeoffs:

1. Users cannot compose/send directly in existing external threads from chat in v1.
2. Local chat addressing (`user@localhost`) is synthetic and primarily for local operator workflow.

## Alternatives Considered

1. Allow writing in all existing threads:
   - broader capability, higher accidental-send and recipient ambiguity risk.
2. Require explicit recipient prompt for every send:
   - flexible but heavy UX and error-prone for iterative conversation.
3. Introduce separate non-email local chat protocol:
   - conflicts with Protege email-native architecture.
