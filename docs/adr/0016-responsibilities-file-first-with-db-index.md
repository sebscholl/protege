# ADR 0016: Responsibilities Are File-First with DB Runtime Index

- Date: 2026-02-20
- Status: Accepted
- Technical Story: Preserve developer-first prompt editing while keeping scheduler runtime state reliable

## Context

Scheduler responsibilities include human-authored prompts and schedules that should be easy to edit, review, and version. Protege favors file-centric workflows for operator/developer experience.

At the same time, scheduler execution needs indexed runtime state and run tracking for reliable processing and observability.

## Decision

1. Responsibility definitions are file-first and persona-scoped:
   - `personas/<persona_id>/responsibilities/<responsibility_id>.md`
2. Responsibility markdown files include frontmatter fields:
   - `name`
   - `schedule`
   - `enabled`
3. Responsibility markdown body is the canonical prompt text.
4. Scheduler uses a DB runtime index (`responsibilities` table) for:
   - validated schedule values
   - enable/disable state
   - prompt path and hash
5. A reconcile/sync step updates DB index from files (file -> DB direction).
6. Sync is non-destructive by default:
   - missing files are marked disabled rather than deleted.
   - explicit prune/delete can be added later as opt-in behavior.

## Consequences

Positive:

1. Developers/operators edit prompts and schedules in files, with normal git workflows.
2. Runtime lookup remains efficient and explicit via DB index.
3. Scheduler state and history remain queryable and auditable.

Tradeoffs:

1. System now has file + DB reconciliation complexity.
2. Sync behavior must be clearly documented to avoid operator surprise.

## Alternatives Considered

1. DB-only responsibilities:
   - simpler runtime internals, poorer developer editing/versioning UX.
2. File-only responsibilities with no DB index:
   - simpler model, weaker runtime state management and execution observability.
3. Bidirectional sync as equal sources:
   - higher conflict complexity than needed for v1.
