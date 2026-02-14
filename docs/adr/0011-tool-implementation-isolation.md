# ADR 0011: Tool Implementation Isolation Boundary

- Date: 2026-02-14
- Status: Accepted
- Technical Story: Keep extension tooling scalable by eliminating tool-specific coupling in core engine modules

## Context

Protege tool loading now works through a manifest and registry, but some tool-specific artifacts can still leak into shared harness contracts or runtime code. This creates tight coupling and reduces scalability as the number of tools grows.

The project requires a strict extension boundary where each tool is independently implemented and core engine systems remain generic.

## Decision

Adopt a strict tool-isolation policy:

1. Tool-specific code must live only under `extensions/tools/{tool-name}/`.
2. Each tool exposes a single entry point (`index.ts`) that exports its definition and execution method.
3. Core engine modules may provide only generic capabilities:
   - manifest loading
   - contract validation
   - tool execution dispatch
   - generic runtime action invocation
4. Core engine modules must not define types or helpers that apply to only one tool.
5. Tool-specific types, validation, payload mapping, and result mapping must be owned by the tool module.

## Consequences

Positive:

1. New tools can be added without editing core tool contracts for tool-specific details.
2. Tool modules are easier to test and distribute independently.
3. Core harness/runtime code remains stable and reusable.

Tradeoffs:

1. Some payload adaptation may be duplicated across tool modules.
2. Runtime action routing still needs clear generic interfaces and error contracts.

## Alternatives Considered

1. Keep mixed tool-specific helper types in engine contracts:
   - quicker short-term, but increasingly brittle as tool count grows.
2. Centralize all tool schemas/types in one engine file:
   - easier discoverability, but violates extension isolation and increases coupling.
