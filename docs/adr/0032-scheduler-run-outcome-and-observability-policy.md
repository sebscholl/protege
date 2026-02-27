# ADR-0032: Scheduler Uses Explicit Run Outcomes and Structured Observability

- Status: Accepted
- Date: 2026-02-27
- Deciders: Protege team
- Technical Story: Make scheduler behavior diagnosable and auditable without ambiguous logs.

## Context

Scheduler v1 already persists run records and sends failure alerts (ADR-0017), but hardening requires clear visibility into why runs did not execute (overlap/cap limits), and whether terminal failures were operational, configuration, or runtime-tool errors.

## Decision

1. Scheduler records explicit run outcomes, not just success/failure.
2. Minimum outcome set for hardening:
   - `succeeded`
   - `failed`
   - `skipped_overlap`
   - `skipped_concurrency`
3. Failed outcomes include structured error category fields suitable for operator diagnosis.
4. Scheduler emits structured log events for run lifecycle transitions and skip reasons.
5. Owner/admin alert behavior remains for terminal failures only (not for skip outcomes).

## Consequences

Positive:

1. Operators can distinguish reliability issues from expected guardrail behavior.
2. Testability improves because outcomes are explicit and queryable.
3. Future dashboards/status surfaces can reuse durable outcome categories.

Tradeoffs:

1. Slightly larger run-record schema and lifecycle logic.
2. Requires migration and regression tests for outcome mapping.

## Alternatives Considered

1. Keep binary success/failure only:
   - rejected because saturation and overlap behavior become opaque.
2. Log-only skip behavior with no persisted outcome:
   - rejected due to poor auditability and weaker test assertions.
