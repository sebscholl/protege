# ADR 0017: Scheduler v1 Uses New-Thread Synthetic Runs with No Retry and Failure Alerts

- Date: 2026-02-20
- Status: Accepted
- Technical Story: Deliver proactive scheduling with predictable thread growth and explicit failure visibility

## Context

Responsibilities execute asynchronously through the same harness/tool path as inbound email. We need clear v1 behavior for thread strategy and failure handling.

Key requirements:

1. Avoid unbounded linear thread growth for recurring runs.
2. Keep v1 failure behavior explicit and observable.
3. Reuse existing harness email-native execution path.

## Decision

1. Every responsibility run creates a synthetic inbound message.
2. Each run uses a new thread (`thread_id` is unique per run).
3. Scheduler v1 uses single-attempt execution only (no retry scheduling).
4. On failed run, scheduler sends one owner alert email.
5. Run records persist immutable execution snapshots, including prompt snapshot/hash used for that run.

## Consequences

Positive:

1. Recurring responsibilities do not accumulate giant threads by default.
2. Failure conditions are surfaced immediately through owner alerts.
3. Behavior remains deterministic and simple for v1 operations.

Tradeoffs:

1. No automatic recovery from transient failures in v1.
2. Owner may receive more frequent alerts until retry policies are introduced.

## Alternatives Considered

1. Reuse one long-lived thread per responsibility:
   - better longitudinal continuity, worse thread growth/noise for frequent jobs.
2. Add retry with exponential backoff in v1:
   - more resilient, but higher complexity and more states before baseline is stable.
3. Silent failure logging only:
   - simpler, but fails reliability/visibility expectations.
