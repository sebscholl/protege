# Milestone Plan: Hooks Runtime and Dispatch

Status: Complete
Scope: Implement extension hooks as async, non-blocking subscribers to runtime events.

## Decision Anchors

1. `docs/adr/0004-trusted-in-process-extensions.md`
2. `docs/adr/0011-tool-implementation-isolation.md`
3. `docs/adr/0033-hooks-manifest-and-async-dispatch-v1.md`

## Goals

1. Add deterministic hook loading from `extensions/extensions.json`.
2. Support event-filtered subscriptions per hook.
3. Dispatch hooks for runtime events without blocking origin flow.
4. Keep hook-specific logic isolated under `extensions/hooks/*`.

## Non-Goals (v1)

1. No hook retries or delivery guarantees.
2. No hook result aggregation surfaced to user flows.
3. No external sandboxing or process isolation for hooks.

## H1: Manifest and Contract

Status: Complete

### Tasks

1. Extend hook manifest parsing to support string and object entries.
2. Validate object entry shape:
   - `name`, `events`, `config`.
3. Apply deep-merge of manifest `config` over hook defaults.
4. Keep deterministic hook execution order by manifest order.

### Tests

1. `tests/engine/harness/hooks-manifest.test.ts`

### Acceptance

1. Invalid hook manifest entries fail with explicit validation errors.
2. Hook enablement is manifest-presence only.
3. Effective config reflects default+override merge behavior.

## H2: Hook Loader and Registry

Status: Complete

### Tasks

1. Add generic hook contract types in engine.
2. Implement hook registry loader for `extensions/hooks/{name}/index.ts` and `index.js`.
3. Build event subscription index with wildcard support.
4. Enforce hook callback signature:
   - `onEvent(event, payload, config)`

### Tests

1. `tests/engine/harness/hook-registry.test.ts`

### Acceptance

1. Hooks load without hook-specific engine coupling.
2. Subscription resolution returns expected hooks for exact and wildcard events.

## H3: Async Event Dispatch

Status: Complete

### Tasks

1. Introduce hook dispatch adapter connected to runtime logger event stream.
2. Dispatch matching hooks asynchronously and non-blocking.
3. Isolate hook failures and emit structured hook error logs.
4. Pass `event`, `payload`, and resolved `config` as discrete callback arguments.

### Tests

1. `tests/engine/harness/hooks-dispatch.test.ts`
2. `tests/e2e/hooks-observer.test.ts`

### Acceptance

1. Origin runtime flow completes regardless of hook latency/failure.
2. Hook failures are logged with hook name and event metadata.
3. Multiple hooks for same event execute in manifest order.

### Completion Notes

1. Hook dispatch is wired through logger emission callbacks in gateway and chat runtimes.
2. Dispatch remains non-blocking (fire-and-forget) with per-hook failure isolation.
3. Edge-case coverage includes slow hooks, failing hooks, wildcard/exact subscriptions, and manifest-order execution.
4. E2E coverage validates real manifest->loader->logger->dispatcher->hook callback flow.

## H5: Default Memory Synthesis Hooks (Planned)

Status: Complete

Decision anchor:

1. `docs/adr/0037-memory-synthesis-hooks-and-chained-events-v1.md`

### Tasks

1. Ship default hooks:
   - `thread-memory-updater`
   - `active-memory-updater`
2. Add chained event sequencing:
   - `harness.inference.completed` -> `memory.thread.updated` -> active-memory flow
3. Add DB-backed active-memory dirty-state persistence.
4. Add hook-level provider/model override config and prompt-path config.
5. Add prompt files under `prompts/`.

### Acceptance

1. Memory hooks are enabled/disabled via manifest only.
2. Active memory never runs before thread memory commit for a completed inference.
3. Dirty-state survives restarts and coalesces bursts.
4. Memory synthesis uses editable file-based prompts.

### Completion Notes

1. Default hook modules shipped:
   - `extensions/hooks/thread-memory-updater`
   - `extensions/hooks/active-memory-updater`
2. Hook dispatcher now supports chained event emissions from hook callback return payloads (`{ emit: [...] }`).
3. Thread memory state and persona active-memory synthesis state persistence landed via migration:
   - `engine/shared/migrations/0005_memory_synthesis_state.sql`
4. Prompt files shipped:
   - `prompts/thread-summary.md`
   - `prompts/active-summary.md`
5. Coverage added:
   - `tests/extensions/hooks/thread-memory-updater/index.test.ts`
   - `tests/extensions/hooks/active-memory-updater/index.test.ts`
   - `tests/engine/harness/memory/storage.test.ts`
   - `tests/e2e/memory-synthesis-hooks.test.ts`

## H4: Docs and Operator Guidance

Status: Complete

### Tasks

1. Update `extensions/README.md` with hook object-form schema.
2. Expand `extensions/hooks/README.md` with authoring contract and examples.
3. Update `docs/status.md` planning updates after implementation.
4. Add hook event catalog and payload contract documentation.

### Acceptance

1. Hook authoring flow is clear without reading engine internals.
2. Runtime behavior, ordering, and failure semantics are explicit.

### Completion Notes

1. Hook docs include JS/TS entrypoint guidance and distribution recommendations.
2. Event names and payload contract are documented in `extensions/hooks/EVENTS.md`.

## Exit Criteria

1. Hook manifest schema is implemented and validated.
2. Runtime emits hook dispatches for logged events.
3. Hook dispatch is async, non-blocking, and failure-isolated.
4. Docs and tests reflect the final contract.
