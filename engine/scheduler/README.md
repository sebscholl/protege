# Scheduler

Extension Surface: No

Implements recurring responsibility orchestration across all personas.

Scheduler is transport-agnostic and hosted by gateway runtime. It triggers synthetic inbound tasks routed through the harness.

Core modules:

1. `storage.ts`: responsibility index and run-record persistence helpers.
2. `sync.ts`: file-first responsibility reconciliation (`.md` + frontmatter -> DB index).
3. `cron.ts`: cron registration and run enqueue trigger layer.
4. `runner.ts`: queued run execution through synthetic inbound harness flow.

Responsibility authoring:

1. Persona-scoped source-of-truth files live under:
   - `personas/<persona_id>/responsibilities/<responsibility_id>.md`
2. Required frontmatter keys:
   - `name`
   - `schedule`
   - `enabled`
3. Markdown body is the canonical prompt text for execution snapshots.
