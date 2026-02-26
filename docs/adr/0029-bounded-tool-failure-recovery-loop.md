# ADR-0029: Harness Uses a Bounded Tool-Failure Recovery Loop

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Avoid terminal run failure on first tool error while preventing unbounded retry loops.

## Context

Current tool execution fails the run when one tool call throws. This is brittle for common recoverable failures (path mistakes, transient network errors, invalid first-attempt arguments). We need better reliability without introducing open-ended autonomous retry behavior.

## Decision

1. Harness tool orchestration uses a bounded recovery loop per inbound run.
2. Tool-call failures are surfaced back to the model as structured tool-error results, not immediate terminal run failures.
3. Recovery budget is explicit and configurable:
   - `max_tool_failures_per_run` (default: `3`)
   - `max_total_tool_calls_per_run` (default: `12`)
4. Orchestrator stops the run and marks failure when either budget is exhausted.
5. Non-recoverable classes still terminate immediately:
   - invalid tool name / missing tool
   - schema validation failures that cannot be coerced
   - runtime action unsupported
6. Terminal failure summaries are persisted and logged with:
   - failed tool call ids
   - error messages
   - budget counters at stop
7. Scheduler-initiated runs use the same bounded policy; failure alerting continues through `admin_contact_email`.

## Consequences

Positive:

1. Fewer false-terminal failures for fixable tool mistakes.
2. Stronger autonomous behavior while preserving deterministic ceilings.
3. Better debugging signal from structured failure summaries.

Tradeoffs:

1. More tokens may be consumed during recovery attempts.
2. Tool loops are still possible within budget and must be monitored.
3. Requires clear logs so operators understand why a run stopped.

## Alternatives Considered

1. Fail-fast on first tool error:
   - rejected due to poor resilience.
2. Unlimited retries until model stops:
   - rejected due to runaway risk and cost unpredictability.
3. Per-tool custom retry policies in v1:
   - rejected as premature complexity; deferred until base bounded loop is proven.
