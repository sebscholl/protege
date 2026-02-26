# ADR-0024: Web Search Tool v1 Is Provider-Agnostic with Config-Selected Adapters

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Add strong web discovery capability without coupling harness/tool behavior to one search vendor.

## Context

After `web_fetch`, Protege needs a discovery tool that can find relevant URLs and snippets from the web. Search providers differ in request/response contracts, ranking metadata, and auth models. If we bind `web_search` to one vendor, we create avoidable lock-in and migration churn.

We need one normalized tool contract that:

1. keeps prompts/harness behavior stable across providers
2. lets operators select provider by config
3. supports provider-specific API keys through environment variables

## Decision

1. Add first-party tool `web_search` under `extensions/tools/web-search/`.
2. Map tool execution to runtime action `web.search`.
3. Implement provider adapters behind the runtime action with v1 initial providers:
   - `tavily`
   - `perplexity`
4. Provider selection is config-driven in tool config:
   - `provider` (default active provider)
   - `providers.<name>.apiKeyEnv`
   - optional provider base URL overrides
5. `web_search` output is normalized regardless of provider:
   - `provider`
   - `query`
   - `results[]` where each result includes:
     - `title`
     - `url`
     - `snippet`
     - optional `publishedAt`
     - optional `source`
   - `truncated`
   - `totalReturned`
6. Missing provider credentials fail explicitly with actionable error text.
7. Provider-specific fields are not exposed in v1 normalized result payload.

## Consequences

Positive:

1. Operators can swap providers without prompt or harness changes.
2. Tool contract remains stable as providers evolve.
3. Per-provider outage or policy changes are easier to mitigate.

Tradeoffs:

1. Adapter layer adds implementation and test surface.
2. Some provider-specific richness is intentionally omitted in v1.
3. We must maintain contract parity tests for each supported provider adapter.

## Alternatives Considered

1. Single-provider `web_search` v1:
   - rejected due to lock-in and weaker operator flexibility.
2. Expose provider-native outputs directly:
   - rejected due to coupling and unstable model-facing contracts.
3. Relay-only search abstraction with no local provider support:
   - rejected because v1 should support self-hosted provider keys directly.
