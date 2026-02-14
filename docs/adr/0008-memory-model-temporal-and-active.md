# ADR-0008: Memory Model Splits into Temporal and Active Memory

- Status: Accepted
- Date: 2026-02-14
- Deciders: Protege team
- Technical Story: Clarify memory naming and responsibilities as M2 storage begins

## Context

The project needs explicit memory semantics that distinguish durable chronological history from short-lived working context. Existing naming (`protege.db`) does not communicate memory role clearly.

## Decision

1. Persistent SQLite memory is named `memory/{persona_id}/temporal.db`.
2. Short-horizon working memory is named `memory/{persona_id}/active.md`.
3. Memory responsibilities are split:
   - Temporal memory: sequence/time-oriented durable history.
   - Active memory: immediate, brief working context.
4. Runtime storage defaults and docs use this naming going forward.

## Consequences

1. Memory boundaries are explicit and easier to reason about.
2. Future harness logic can treat retrieval and working context as distinct concerns.
3. Existing references to `protege.db` and non-namespaced memory paths should be migrated progressively in docs/code.

## Alternatives Considered

1. Keep single `protege.db`: simpler naming, weaker semantic clarity.
2. Multiple SQLite DBs for all memory classes: richer modeling, unnecessary complexity for current stage.
3. Active memory in DB table only: less human legibility than markdown.
