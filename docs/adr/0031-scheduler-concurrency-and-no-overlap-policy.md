# ADR-0031: Scheduler Enforces No-Overlap and Bounded Concurrency

- Status: Accepted
- Date: 2026-02-27
- Deciders: Protege team
- Technical Story: Prevent scheduler starvation and duplicate execution while keeping v1 behavior deterministic.

## Context

Scheduler runtime is gateway-owned (ADR-0018) and executes persona-owned responsibilities across a shared process. Without explicit concurrency and overlap rules, responsibilities can collide, overwhelm runtime resources, and produce non-deterministic behavior under bursty schedules.

## Decision

1. Scheduler enforces one active run per responsibility (`no-overlap`).
2. Scheduler enforces one runtime cap from `config/system.json`:
   - `scheduler.max_global_concurrent_runs`
3. When a due run cannot start because of `no-overlap` or concurrency caps, scheduler does not start an additional run for that tick.
4. Skipped ticks due to runtime guardrails are logged and persisted as explicit run outcomes (see ADR-0032).
5. Scheduler cap is a backpressure guard against runaway scheduling, not a limit on harness/tool-loop capability inside one claimed run.

## Consequences

Positive:

1. Deterministic execution behavior under load.
2. Reduced risk of duplicate side effects for the same responsibility.
3. Stronger protection against runaway parallelism and process pressure.

Tradeoffs:

1. Some due ticks are intentionally skipped during saturation.
2. Operators must tune concurrency caps to match machine capacity.

## Alternatives Considered

1. Unlimited parallel execution:
   - rejected due to reliability and resource-risk concerns.
2. Queue all blocked ticks for later replay:
   - rejected for v1 due to additional state complexity and catch-up ambiguity.
3. Global single-threaded runner:
   - rejected because it unnecessarily serializes unrelated responsibilities.
