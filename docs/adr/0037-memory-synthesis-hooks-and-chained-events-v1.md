# ADR-0037: Memory Synthesis Uses Default Hooks with Chained Events

- Status: Accepted
- Date: 2026-03-06
- Deciders: Protege team
- Technical Story: Implement thread and active memory synthesis as configurable hook extensions with deterministic sequencing.

## Context

Protege already has:

1. async, non-blocking hook dispatch (`ADR-0033`)
2. layered context loading (`ADR-0034`, `ADR-0036`)
3. tool trace persistence (`ADR-0035`)

Memory synthesis now needs to be:

1. optional/toggleable by users
2. configurable like other extensions
3. sequenced so active memory reflects thread-memory updates
4. cost-aware (allow cheap model override)

## Decision

Use hooks (not responsibilities or hardcoded framework jobs) for both memory synthesis flows.

### 1) Default hook extensions

Ship these hook extensions by default and enable them in `extensions/extensions.json`:

1. `thread-memory-updater`
2. `active-memory-updater`

Users can disable/customize by editing manifest entries, same as tools/providers.

### 2) Sequencing contract (chained events)

Do not run thread and active synthesis in parallel off the same origin event.

Required event chain:

1. `harness.inference.completed` -> `thread-memory-updater`
2. `thread-memory-updater` emits `memory.thread.updated` (or failure counterpart)
3. `active-memory-updater` subscribes to `memory.thread.updated`

Active memory must never trigger directly from `harness.inference.completed`.

### 3) Dirty-state model for active memory

Active memory updates are persona-level and coalesced.

When `memory.thread.updated` is received:

1. upsert persona dirty state in DB (`dirty=true`, timestamps, trigger metadata)
2. active-memory updater consumes dirty personas with debounce/cadence
3. successful synthesis clears dirty flag and updates success timestamp

Dirty-state persistence is DB-backed so signals survive restarts.

### 4) Prompt/input strategy

#### Thread memory updater

Use incremental summarization input:

1. previous thread summary/state
2. new delta since last synthesis:
   - messages
   - tool call/result events
3. target state shape:
   - objective
   - key facts
   - decisions/commitments
   - open loops
   - constraints/preferences
   - next likely actions

Avoid full-thread re-summarization by default.

#### Active memory updater

Use consolidation input:

1. existing `memory/{persona_id}/active.md`
2. recently updated thread memory states for persona
3. optional persona context (`PERSONA.md`) for relevance filtering

Output is concise persona working memory (cross-thread high-signal only).

### 5) Model/provider config policy

Each memory hook supports optional model override config:

1. `provider` (optional)
2. `model` (optional)
3. `prompt_path` (required/defaulted)
4. token and cadence/debounce controls

If `provider`/`model` are unset, inherit runtime default inference provider/model.

### 6) Prompt exposure

Prompts are file-based and user-editable:

1. `prompts/thread-summary.md`
2. `prompts/active-summary.md`

## Consequences

Positive:

1. Memory behavior is consistent with extension architecture.
2. Users can enable/disable/customize memory synthesis without framework forks.
3. Deterministic sequencing keeps active memory aligned with thread-memory state.
4. Cost controls are explicit via per-hook model override config.

Tradeoffs:

1. Adds new hook event types and docs surface.
2. Requires durable dirty-state storage and maintenance queries.
3. Default-hook scaffolding supersedes prior “hooks empty by default” convention.

## Alternatives Considered

1. Hardcoded framework workers for memory:
   - rejected due to reduced extensibility and inconsistent architecture.
2. Responsibilities for memory synthesis:
   - rejected because it couples framework maintenance to user scheduler flows.
3. Parallel thread/active synthesis from same event:
   - rejected because active memory depends on latest thread-memory state.
