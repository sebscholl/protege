# ADR-0035: Persist Tool Calls and Results in Thread Timeline for Continuity

- Status: Accepted
- Date: 2026-03-04
- Deciders: Protege team
- Technical Story: Preserve tool-execution continuity across generations by storing tool traces as first-class thread events.

## Context

Current harness behavior executes tool loops in-memory during a run, but only inbound/outbound messages are durably persisted in thread history. This means tool call/result context is lost between turns, which causes continuity gaps in subsequent generations.

Protege needs tool traces to be recoverable as part of thread context while keeping ordering deterministic and easy to reason about.

## Decision

Persist tool loop events as thread-scoped synthetic message events.

Required linkage fields for each persisted tool event:

1. `thread_id`: thread scope.
2. `parent_message_id`: inbound message id that triggered the run.
3. `run_id`: harness run id for one inbound turn.
4. `step_index`: deterministic sequence within run.
5. `event_type`: one of:
   - `tool_call`
   - `tool_result`
   - `assistant_final` (optional synthetic mirror when useful)

Additional payload:

1. `tool_name`
2. `tool_call_id`
3. `payload_json` (normalized and size-bounded)
4. `error` metadata when applicable

Ordering contract:

1. Thread chronology stays at message timeline level.
2. Within each inbound parent message, tool events are ordered by `step_index`.
3. Timestamp is informational; causal ordering must not depend solely on timestamp precision.

## Consequences

Positive:

1. Subsequent turns can load prior tool reasoning/actions for continuity.
2. Tool behavior is auditable and debuggable in thread history.
3. Context-building can include compact tool summaries without relying on provider hidden reasoning.

Tradeoffs:

1. Storage volume increases for tool-heavy runs.
2. Requires bounded payload persistence and truncation policy.
3. Requires migration and query updates for context assembly and chat rendering.

## Alternatives Considered

1. Do not persist tool traces:
   - rejected because continuity is lost between generations.
2. Persist only in logs:
   - rejected because logs are not canonical thread memory and are harder to query causally.
3. Order by timestamp only:
   - rejected due to collision/precision ambiguity under rapid event sequences.
