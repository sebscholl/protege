# ADR-0003: Pluggable Provider Adapter Contract with Explicit Capability Parity

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Support OpenAI, Anthropic, Gemini, and Grok without polluting core harness

## Context

Providers differ in API shape, tool-calling semantics, response formats, and error models. Protege needs a clean harness interface that supports multiple providers while preserving predictable behavior.

## Decision

1. Implement provider adapters behind one normalized interface.
2. Required adapter operations:
   - `generate()`
   - `generateWithTools()`
   - `generateStructured()`
3. Initial adapters: OpenAI, Anthropic, Gemini, Grok.
4. Adapters must normalize:
   - request mapping
   - response mapping
   - error taxonomy
   - usage metadata (tokens/model/latency when available)
5. Capability behavior is explicit: no silent downgrade.
   - If an operation is unsupported for a provider/model, adapter returns a typed, actionable error.

## Consequences

1. Harness remains provider-agnostic and easier to test.
2. Provider differences are isolated to adapter boundary.
3. We must maintain adapter conformance tests across four providers.
4. Product behavior stays predictable under provider limitations.

## Alternatives Considered

1. Single provider in v1: fastest path, conflicts with product requirement.
2. Provider-specific logic in harness: lower initial abstraction work, high long-term complexity.
3. Best-effort fallback behavior: fewer errors surfaced, unpredictable agent outcomes.
