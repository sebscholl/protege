# Milestone Plan: Scheduler (Responsibilities)

Status: In Progress  
Scope: Global scheduler runtime executing persona-owned responsibilities driven by cron schedules through harness/tool pipeline.

## Goals

1. Introduce proactive recurring execution for responsibilities across all personas.
2. Preserve file-first developer UX for responsibility authoring.
3. Reuse existing harness pipeline with synthetic inbound messages.
4. Provide deterministic v1 execution policy and failure visibility.

## Non-Goals (v1)

1. No automatic retry scheduling.
2. No complex catch-up semantics for missed runs.
3. No advanced scheduler dashboard UI.

## Decision Anchors

1. File-first responsibility source of truth:
   - `docs/adr/0016-responsibilities-file-first-with-db-index.md`
2. v1 run policy (new thread, no retries, failure alert):
   - `docs/adr/0017-scheduler-v1-run-policy.md`
3. runtime ownership boundary:
   - `docs/adr/0018-scheduler-runtime-owned-by-gateway.md`

## Migration Plan: Gateway-Owned Scheduler Runtime

Status: In Progress

### Objective

Move scheduler long-running execution from standalone scheduler process into gateway runtime, keeping scheduler transport-agnostic and global across persona-owned responsibilities.

### Phase M1: Runtime Ownership Shift

1. Embed scheduler cron + runner lifecycle in `gateway start`.
2. Reuse gateway-owned runtime action invoker for scheduler tool calls.
3. Remove scheduler relay-client startup from scheduler runtime.
4. Run one global scheduler loop that evaluates responsibilities for all personas.

Exit:

1. Gateway runs responsibilities without scheduler opening any network connections.
2. Responsibilities from multiple personas are scheduled and executed from one runtime loop.

Progress:

1. Scheduler runtime is embedded in `gateway start`.
2. Scheduler no longer starts relay clients.
3. Scheduler cycle runs across all persona-owned responsibility DBs in one process.

### Phase M2: CLI Surface Realignment

1. Keep `protege scheduler sync` as control-plane command.
2. Remove `protege scheduler start` and add explicit guidance:
   - scheduler runtime is hosted by `protege gateway start`.
3. Update docs/help text to remove dual-runtime instruction patterns.

Exit:

1. No operator path suggests running a standalone networked scheduler process.

Progress:

1. `scheduler` CLI now supports control-plane sync only.
2. User-facing CLI docs route scheduler runtime usage through `gateway start`.

### Phase M3: Regression and E2E Hardening

1. Add regression tests proving no scheduler-owned relay clients are started.
2. Add gateway integration tests for multi-persona responsibilities executing while relay is connected.
3. Add manual checklist:
   - run gateway + responsibilities
   - verify scheduled sends and stable relay auth session

Exit:

1. Gateway+scheduler co-execution is stable with no relay auth thrash.

## S1. Responsibility File Contract + Sync

Status: Complete

### Tasks

1. Define persona responsibility directory layout:
   - `personas/<persona_id>/responsibilities/*.md`
2. Parse markdown frontmatter:
   - `name`, `schedule`, `enabled`
3. Treat markdown body as canonical prompt text.
4. Build sync/reconcile flow:
   - upsert definitions into DB index
   - mark missing files as disabled by default
5. Persist prompt path/hash in DB index.

### Tests

1. Valid file parses and syncs.
2. Invalid frontmatter fails with clear error.
3. Missing-file reconciliation disables DB record (non-destructive).
4. Hash changes are detected when prompt text changes.

## S2. Scheduler Storage + Run Records

Status: Complete

### Tasks

1. Add `responsibilities` table for runtime index/state.
2. Add `responsibility_runs` table for immutable run history.
3. Implement storage APIs:
   - list/query enabled responsibilities
   - enqueue run
   - claim run
   - mark success/failure

### Tests

1. CRUD/index operations are deterministic.
2. Run lifecycle transitions are valid.
3. Persona isolation is enforced.

## S3. Cron Trigger + Runner

Status: In Progress

### Tasks

1. Register enabled schedules from DB index using `node-cron`.
2. On tick, enqueue one run row (`queued`).
3. Runner claims queued runs with:
   - per-responsibility no-overlap lock
   - global concurrency cap
4. Build synthetic inbound message from run:
   - new `thread_id` per run
   - synthetic `message_id`
5. Execute via existing harness/tool runtime path.
6. Persist run results and message IDs.

Progress:

1. Cron trigger + enqueue path implemented.
2. Runner single-cycle execution implemented with synthetic inbound message creation and run-state transitions.
3. Scheduler runtime lifecycle currently exists as standalone scheduler foreground process and is pending migration to gateway-owned lifecycle.
4. Remaining:
   - per-responsibility no-overlap lock and global concurrency cap
   - E2E/manual hardening for production behavior

### Tests

1. Due schedules enqueue runs.
2. Claimed runs execute through harness path.
3. New-thread policy is enforced per run.
4. Overlap prevention works for same responsibility.

## S4. Failure Alerts (No Retry)

Status: In Progress

### Tasks

1. On failed run, mark status `failed` and persist error details.
2. Send one owner alert email through existing outbound path.
3. Do not reschedule retries in v1.

Progress:

1. Failed-run state transitions are implemented.
2. Failure alert callback contract is implemented in runner.
3. Default failure alert email path is wired in scheduler runtime.
4. Remaining:
   - owner-target routing policy refinement (currently uses configured sender address)

### Tests

1. Failure produces exactly one alert.
2. No retry row/job is created.
3. Failed run remains queryable with error context.

## S5. End-to-End Validation

Status: Planned

### Tasks

1. Add scheduler E2E test coverage for success and failure.
2. Validate synthetic inbound persistence + harness output.
3. Validate failure alert emission path.
4. Add manual verification checklist.

### Tests

1. Real flow: schedule -> run -> outbound result.
2. Failure flow: schedule -> failed run -> owner alert.

## Exit Criteria

1. Responsibilities are file-authored and DB-indexed.
2. Runs execute on schedule and invoke harness/tools.
3. Each run creates a new thread.
4. Failures alert owner with no retries in v1.
5. `lint`, `typecheck`, and `test` pass.
