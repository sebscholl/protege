# Milestone Plan: Scheduler (Responsibilities)

Status: Planned  
Scope: Persona-scoped proactive runs driven by cron schedules and executed through harness/tool pipeline.

## Goals

1. Introduce proactive recurring execution for persona responsibilities.
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

Status: Planned

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

### Tests

1. Due schedules enqueue runs.
2. Claimed runs execute through harness path.
3. New-thread policy is enforced per run.
4. Overlap prevention works for same responsibility.

## S4. Failure Alerts (No Retry)

Status: Planned

### Tasks

1. On failed run, mark status `failed` and persist error details.
2. Send one owner alert email through existing outbound path.
3. Do not reschedule retries in v1.

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
