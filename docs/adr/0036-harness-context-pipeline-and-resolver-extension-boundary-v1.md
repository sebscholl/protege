# ADR-0036: Harness Context Pipeline Uses Resolver Extensions with Unified Registration

- Status: Accepted
- Date: 2026-03-04
- Deciders: Protege team
- Technical Story: Make context loading a first-class, fully configurable framework surface with consistent extension boundaries.

## Context

Context loading is now a core system behavior that must be:

1. deterministic
2. fully configurable
3. extensible without hidden runtime hardcoding
4. consistent with Protege extension architecture

Tools and hooks already follow manifest-driven extension registration. Context loading currently does not.

## Decision

Adopt a unified resolver-based context pipeline with these boundaries:

1. Harness owns resolver contracts, pipeline runner, validation, and orchestration.
2. Resolver implementations live in `extensions/resolvers/*`.
3. Resolver registration is manifest-driven in `extensions/extensions.json` under `resolvers`.
4. Context pipeline config is declarative in `configs/context.json` using only resolver-call steps:
   - `<resolver-name>`
   - `<resolver-name>(arg1, arg2, ...)`
5. Shipped and custom resolvers use the same resolver contract and invocation shape.
6. Resolver invocation shape is:
   - top-level `type`
   - top-level `context`

Harness directory structure is normalized to explicit subdomains:

1. `engine/harness/context/`
2. `engine/harness/tools/`
3. `engine/harness/hooks/`
4. `engine/harness/resolvers/`

## Consequences

Positive:

1. Context loading becomes framework-level API, not ad-hoc runtime logic.
2. No special-case distinction between built-in and custom resolver API.
3. Runtime entry points (gateway/chat/scheduler) can call one shared context pipeline.
4. Extension model is consistent across tools/hooks/resolvers.

Tradeoffs:

1. Requires migration across harness module paths and loader internals.
2. Requires coordinated migration across config defaults and tests when resolver-call syntax evolves.
3. Introduces new config validation and resolver registry tests.

## Alternatives Considered

1. Keep context loading hardcoded in harness runtime:
   - rejected due to framework/extension goals.
2. Introduce separate builtin context step type:
   - rejected to keep API vocabulary minimal and uniform.
3. Keep resolver implementations inside `engine/` only:
   - rejected to preserve extension ownership and user-customizable architecture.
