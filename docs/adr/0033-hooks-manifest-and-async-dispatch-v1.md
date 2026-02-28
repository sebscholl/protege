# ADR 0033: Hooks Manifest and Async Dispatch (v1)

- Date: 2026-02-28
- Status: Accepted
- Deciders: Core runtime
- Technical Story: Implement hook extensions with deterministic loading, explicit subscriptions, and non-blocking execution

## Context

Protege tools are already manifest-driven and isolated under `extensions/tools/*`.

Hooks are intended to support adjacent automation (for example notifications or audit sinks) without becoming part of core request lifecycle control. Current docs define hooks at a high level, but the concrete contract for manifest shape, event subscription, ordering, and failure behavior is not frozen.

## Decision

Adopt the following v1 hook contract.

### 1. Manifest entry shape

`extensions/extensions.json` `hooks` supports:

1. String entry:
   - `"hook-name"`
2. Object entry:
   - `name` (required, non-empty string)
   - `events` (optional string array, default `["*"]`)
   - `config` (optional object, deep-merged with hook defaults)

### 2. Subscription model

1. Hooks subscribe by event name through `events`.
2. `["*"]` subscribes to all events.
3. Any logged runtime event is eligible for hook dispatch.
4. Hook callback signature is `onEvent(event, payload, config)`:
   - `event`: event name string
   - `payload`: event payload object
   - `config`: resolved hook config object

### 3. Execution model

1. Hook execution is async and fire-and-forget.
2. Hook dispatch is non-blocking and never gates request lifecycle completion.
3. Multiple hooks on the same event run in manifest order.
4. Hook failures are isolated and logged; they do not fail the originating flow.

### 4. Isolation boundary

1. Hook-specific code lives only in `extensions/hooks/{hook-name}/`.
2. Each hook exposes one entrypoint (`index.ts`).
3. Engine code can load/validate/dispatch hooks generically but must not contain hook-specific business logic.

### 5. Scaffold default

1. Default scaffold keeps hooks empty:
   - `"hooks": []`
2. `extensions/hooks/` ships with docs only; no default runtime hook entry is scaffolded.

## Consequences

Positive:

1. Deterministic, reproducible hook behavior through manifest order.
2. Strong separation between core lifecycle and side-effect automation.
3. Extensible hook config model consistent with tool config merge semantics.
4. Enable/disable behavior stays explicit and simple: presence in manifest means enabled.

Tradeoffs:

1. Fire-and-forget means no delivery guarantees in v1.
2. Hook execution outcomes are observability-only unless explicitly persisted by hook authors.

## Alternatives Considered

1. Filesystem/glob order execution:
   - rejected because ordering can vary by environment.
2. Synchronous/blocking hook pipeline:
   - rejected because hooks are explicitly non-lifecycle side effects.
3. Hook manifest as string-only list:
   - rejected because per-hook event filters/config are necessary for scale.
