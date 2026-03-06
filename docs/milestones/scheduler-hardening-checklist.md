# Milestone Checklist: Scheduler Hardening

Status: In Progress
Owner: Core runtime
Scope: Finish scheduler reliability hardening before new feature work in scheduler domain.

## Decision Anchors

1. `docs/adr/0017-scheduler-v1-run-policy.md`
2. `docs/adr/0018-scheduler-runtime-owned-by-gateway.md`
3. `docs/adr/0031-scheduler-concurrency-and-no-overlap-policy.md`
4. `docs/adr/0032-scheduler-run-outcome-and-observability-policy.md`

## Exit Criteria

1. No-overlap and concurrency controls are enforced and test-covered.
2. Run outcomes persist explicit skip categories and failure categories.
3. Gateway-hosted scheduler behavior is stable under concurrent schedules.
4. Logs and status outputs are sufficient to diagnose skipped and failed runs.
5. `lint`, `typecheck`, and `test` pass with new scheduler coverage.

## SH1: Concurrency and No-Overlap Enforcement

### Implementation Checklist

- [x] Add deterministic in-memory/runtime tracking for active responsibility runs.
- [x] Enforce one active run per responsibility.
- [x] Enforce `max_global_concurrent_runs` from `configs/system.json`.
- [x] Ensure blocked due ticks are handled as explicit skipped outcomes, not silent drops.

### Target Files

1. `engine/scheduler/runtime.ts`
2. `engine/scheduler/runner.ts`
3. `engine/scheduler/storage.ts`
4. `engine/shared/runtime-config.ts`

### Test Targets

1. `tests/engine/scheduler/runtime.test.ts`
2. `tests/engine/scheduler/runner.test.ts`
3. `tests/engine/scheduler/storage.test.ts`
4. `tests/e2e/relay-roundtrip.test.ts` (scheduler+gateway concurrency slice)

### Acceptance Assertions

1. Same responsibility never runs concurrently.
2. Different responsibilities can run concurrently under caps.
3. Over-cap due ticks are marked skipped with deterministic reason.

## SH2: Run Outcome Taxonomy and Persistence

### Implementation Checklist

- [x] Extend scheduler run status model for `skipped_overlap` (with `skipped_concurrency` reserved for future admission-control behavior).
- [x] Persist skip outcome reason details in run records.
- [x] Add failure category field for terminal failures.
- [x] Keep owner/admin alerts for `failed` only.

### Target Files

1. `engine/shared/migrations/0002_scheduler_index_and_runs.sql` (or new migration)
2. `engine/scheduler/storage.ts`
3. `engine/scheduler/types.ts` (if introduced/extended)
4. `engine/scheduler/runtime.ts`

### Test Targets

1. `tests/engine/scheduler/storage.test.ts`
2. `tests/engine/scheduler/runtime.test.ts`
3. `tests/engine/scheduler/runner.test.ts`

### Acceptance Assertions

1. Run records capture skip outcomes distinctly from failure.
2. Failed runs preserve category details for diagnosis.
3. Skip outcomes never trigger failure alert emails.

## SH3: Structured Scheduler Observability

### Implementation Checklist

- [x] Emit structured lifecycle events for enqueue/claim/start/complete.
- [x] Emit explicit events for overlap-skip and concurrency-skip.
- [x] Include correlation fields (`personaId`, `responsibilityId`, `runId`, `threadId`, `messageId` where available).
- [x] Ensure log wording stays stable for operational grep patterns.

### Target Files

1. `engine/scheduler/runtime.ts`
2. `engine/scheduler/runner.ts`
3. `engine/gateway/index.ts` (integration boundary logs)
4. `guide/troubleshooting.md` (operator log guidance)

### Test Targets

1. `tests/engine/scheduler/runtime.test.ts`
2. `tests/engine/scheduler/runner.test.ts`
3. `tests/engine/cli/logs.test.ts` (if output contract changes)

### Acceptance Assertions

1. Each skip reason appears in structured logs.
2. Run lifecycle can be reconstructed from logs without ambiguity.

## SH4: E2E Reliability Validation

### Implementation Checklist

- [x] Add fixture-backed E2E scenarios for two concurrent responsibilities.
- [x] Add long-running responsibility scenario to verify no-overlap behavior.
- [x] Validate relay-enabled outbound still succeeds under scheduler load.
- [x] Validate scheduler stability while gateway remains primary runtime host.

### Target Files

1. `tests/e2e/relay-roundtrip.test.ts`
2. `tests/e2e/relay-failures.test.ts`
3. `tests/fixtures/email/` (if additional scheduler-driven email fixtures are needed)

### Acceptance Assertions

1. Gateway + scheduler can process overlapping schedules without thrash.
2. Expected emails are delivered and unexpected duplicates are absent.
3. Skip/failed/success outcomes match persisted records and logs.

## SH5: Documentation and Status Closeout

### Checklist

- [x] Update `docs/status.md` with completed scheduler-hardening bullets.
- [x] Update `docs/milestones/scheduler-plan.md` to reference completed SH items.
- [x] Update `engine/scheduler/README.md` for hardened runtime behavior.
- [x] Add/adjust ADR links in `docs/adr/README.md` if needed.

### Acceptance Assertions

1. Docs match implemented behavior and operator expectations.
2. No stale guidance suggests scheduler-owned networking or ambiguous skip behavior.
