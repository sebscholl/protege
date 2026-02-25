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
   - if a responsibility already has an open run (`queued` or `running`), scheduler logs `scheduler.cron.skipped_overlap` and does not enqueue a duplicate.
2. Scheduler dispatch is bounded and parallel:
   - global and per-persona concurrent run limits are enforced from `config/system.json` (`scheduler.max_global_concurrent_runs`, `scheduler.max_per_persona_concurrent_runs`).
3. Failure alerts use global admin contact:
   - `admin_contact_email` in `config/system.json`.
   - if missing, failures are logged and alert send is skipped.

Responsibility authoring:

1. Persona-scoped source-of-truth files live under:
   - `personas/<persona_id>/responsibilities/<responsibility_id>.md`
2. Required frontmatter keys:
   - `name`
   - `schedule`
   - `enabled`
3. Markdown body is the canonical prompt text for execution snapshots.
