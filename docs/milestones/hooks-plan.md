# Milestone Plan: Hooks Runtime and Dispatch

Status: Planned
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

Status: Planned

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

Status: Planned

### Tasks

1. Add generic hook contract types in engine.
2. Implement hook registry loader for `extensions/hooks/{name}/index.ts`.
3. Build event subscription index with wildcard support.
4. Enforce hook callback signature:
   - `onEvent(event, payload, config)`

### Tests

1. `tests/engine/harness/hooks-registry.test.ts`
2. `tests/extensions/hooks/*/index.test.ts` for fixture hook modules

### Acceptance

1. Hooks load without hook-specific engine coupling.
2. Subscription resolution returns expected hooks for exact and wildcard events.

## H3: Async Event Dispatch

Status: Planned

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

## H4: Docs and Operator Guidance

Status: Planned

### Tasks

1. Update `extensions/README.md` with hook object-form schema.
2. Expand `extensions/hooks/README.md` with authoring contract and examples.
3. Update `docs/status.md` planning updates after implementation.
4. Add one example hook README under `extensions/hooks/` docs section only (no default runtime hook entry).

### Acceptance

1. Hook authoring flow is clear without reading engine internals.
2. Runtime behavior, ordering, and failure semantics are explicit.

## Exit Criteria

1. Hook manifest schema is implemented and validated.
2. Runtime emits hook dispatches for logged events.
3. Hook dispatch is async, non-blocking, and failure-isolated.
4. Docs and tests reflect the final contract.
