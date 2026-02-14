# ADR 0009: Provider Contract Shape (v1)

- Date: 2026-02-14
- Status: Accepted
- Technical Story: Clean, explicit normalization model for OpenAI/Anthropic/Gemini/Grok adapters

## Context

Protege must support multiple providers without drifting into provider-specific orchestration logic in harness code. Existing parity policy defines required capabilities (`generate`, tools, structured output) and explicit failures when unsupported.

The project needs one minimal contract that is:

1. Provider-agnostic at harness boundaries.
2. Explicit about capability support.
3. Strict about model id normalization and error taxonomy.

## Decision

Adopt a single normalized adapter contract with:

1. Canonical model id format: `provider/model`.
2. One core adapter function:
   - `generate({ request }) -> response`
3. Capability flags per adapter:
   - `tools`
   - `structuredOutput`
   - `streaming`
4. Explicit capability assertions in harness orchestration:
   - unsupported capability fails with typed error (`unsupported_capability`).
5. Stable provider error taxonomy:
   - `unsupported_provider`
   - `unsupported_capability`
   - `invalid_model_id`
   - `bad_request`
   - `unauthorized`
   - `rate_limited`
   - `timeout`
   - `unavailable`
   - `provider_internal`
   - `response_parse_failed`

This model is represented in `engine/harness/provider-contract.ts`.

## Consequences

Positive:

1. Harness remains clean and provider-agnostic.
2. Provider parity rules are enforceable by code, not convention.
3. Adapter modules can map SDK-specific payloads without leaking complexity.

Tradeoffs:

1. Adapters must translate provider-native request/response formats.
2. Some provider-native features may not surface in v1 normalized contract.

## Alternatives Considered

1. Provider-specific harness branches:
   - simpler short-term, but high long-term maintenance burden.
2. Framework-heavy abstraction layers:
   - broader feature coverage, but adds complexity and indirection.
3. OpenAI-compatible payload as universal format:
   - convenient for some providers, brittle for non-compatible features.
