# Scheduler

Extension Surface: No

Implements recurring responsibility orchestration across all personas.

Scheduler is transport-agnostic and hosted by gateway runtime. It triggers synthetic inbound tasks routed through the harness.

Core modules:

1. `storage.ts`: responsibility index and run-record persistence helpers.
2. `sync.ts`: file-first responsibility reconciliation (`.md` + frontmatter -> DB index).
3. `cron.ts`: cron registration and run enqueue trigger layer.
4. `runner.ts`: queued run execution through synthetic inbound harness flow.

Runtime behavior:

1. Cron enqueue is overlap-safe per responsibility:
   - if a responsibility already has an open run (`queued` or `running`), scheduler logs `scheduler.cron.skipped_overlap`, persists a `skipped_overlap` run outcome, and does not enqueue a duplicate.
2. Scheduler dispatch is bounded and parallel:
   - one global concurrent run cap is enforced from `config/system.json` (`scheduler.max_global_concurrent_runs`).
   - when queued work is temporarily blocked by that global cap, runtime emits `scheduler.cycle.throttled` visibility logs.
3. Failure alerts use global admin contact:
   - `admin_contact_email` in `config/system.json`.
   - if missing, failures are logged and alert send is skipped.
4. Startup recovery finalizes interrupted runs:
   - `running` rows left behind by a stopped gateway process are marked `failed` with `failure_category=runtime` during scheduler persona startup.
   - this prevents permanent overlap-lock conditions after restarts.
5. Run outcomes are explicit and persisted:
   - `succeeded`
   - `failed` (with failure category metadata)
   - `skipped_overlap`
6. Structured observability is emitted for lifecycle and guardrail behavior:
   - enqueue/start/complete/fail events
   - overlap-skip and cycle-throttle events
   - correlation fields (`personaId`, `responsibilityId`, `runId`, `threadId`, `messageId` when available).

Design references:

1. `docs/adr/0016-responsibilities-file-first-with-db-index.md`
2. `docs/adr/0017-scheduler-v1-run-policy.md`
3. `docs/adr/0018-scheduler-runtime-owned-by-gateway.md`
4. `docs/adr/0031-scheduler-concurrency-and-no-overlap-policy.md`
5. `docs/adr/0032-scheduler-run-outcome-and-observability-policy.md`
6. `docs/milestones/scheduler-hardening-checklist.md`

Responsibility authoring:

1. Persona-scoped source-of-truth files live under:
   - `personas/<persona_id>/responsibilities/<responsibility_id>.md`
2. Required frontmatter keys:
   - `name`
   - `schedule`
   - `enabled`
3. Markdown body is the canonical prompt text for execution snapshots.
