# Milestone Plan: Web Search Tool (`web_search`)

Status: In Progress  
Scope: Provider-agnostic web discovery tool with config-selected adapters and normalized result contract.

## Goals

1. Deliver one `web_search` capability that works across multiple providers.
2. Keep tool/harness contract stable and provider-neutral.
3. Support operator-selected provider + API key env mapping via tool config.
4. Implement with tests first and fixture-backed network interception.

## Non-Goals (v1)

1. No provider-specific output passthrough in normalized response.
2. No blended meta-search ranking across multiple providers in one call.
3. No relay-managed search proxy requirement for v1 local operation.
4. No automatic provider fallback chain in first release.

## Decision Anchor

1. `docs/adr/0024-web-search-provider-agnostic-v1.md`

## WS1. Contract and Config Model (Tests First)

Status: Complete

### Tasks

1. Define tool schema in `extensions/tools/web-search/index.ts`.
2. Define config shape in tool defaults + `extensions/extensions.json` override:
   - `provider`
   - `defaultMaxResults`
   - `providers.<provider>.apiKeyEnv`
   - optional `providers.<provider>.baseUrl`
3. Validate tool inputs:
   - required `query`
   - optional `maxResults`
   - optional domain/time filters (if included in v1 schema)
4. Validate configured provider and credential env presence.

### Tests

1. Accepts valid input with required query.
2. Rejects missing/empty query.
3. Rejects unsupported provider names.
4. Fails clearly when provider API key env is missing.

## WS2. Runtime Action and Adapter Boundary (Tests First)

Status: Complete

### Tasks

1. Add runtime action `web.search` in gateway runtime invoker.
2. Define internal adapter contract for provider clients.
3. Route runtime execution by configured provider.
4. Normalize provider responses into shared output shape.

### Tests

1. `web.search` invokes configured provider adapter.
2. Adapter output normalizes to required `results[]` shape.
3. Unknown action/provider failures are explicit and typed.

## WS3. Tavily Adapter (Tests First)

Status: Complete

### Tasks

1. Implement Tavily request mapping.
2. Implement Tavily response normalization.
3. Apply max-results truncation and total-returned metadata.

### Tests

1. Tavily success fixture maps to normalized output.
2. Tavily auth failure maps to actionable error.
3. Tavily non-2xx failure maps to provider error path.

## WS4. Perplexity Adapter (Tests First)

Status: Complete

### Tasks

1. Implement Perplexity request mapping for search response mode.
2. Implement Perplexity response normalization.
3. Align output with Tavily-normalized contract.

### Tests

1. Perplexity success fixture maps to normalized output.
2. Perplexity auth failure maps to actionable error.
3. Perplexity non-2xx failure maps to provider error path.

## WS5. Harness + Registry Integration (Tests First)

Status: Complete

### Tasks

1. Register `web_search` in extension manifest and tool registry.
2. Ensure harness tool loop executes `web.search` through generic runtime path.
3. Ensure chat/gateway contexts consume normalized results without provider branching.

### Tests

1. Tool registry resolves `web_search`.
2. Tool execution invokes `web.search`.
3. Integration path logs provider + total result metadata.

## WS6. Fixtures and Manual Verification

Status: In Progress

### Tasks

1. Add fixture-backed network coverage under:
   - `tests/fixtures/api/tavily/search/200.json`
   - `tests/fixtures/api/tavily/search/401.json`
   - `tests/fixtures/api/perplexity/search/200.json`
   - `tests/fixtures/api/perplexity/search/401.json`
2. Extend fixture helper usage for both providers through `tests/network/`.
3. Add manual verification checklist in development docs:
   - switch provider in extension manifest override
   - verify identical normalized result shape
   - verify missing-key and auth-failure behavior

### Tests

1. Provider fixtures produce deterministic normalized results.
2. Error taxonomy and messages remain consistent across providers.

## Exit Criteria

1. `web_search` is available as an extension tool with provider-agnostic contract.
2. Runtime action `web.search` supports Tavily and Perplexity via adapters.
3. Config-selected provider and env key mapping works predictably.
4. Tests and docs cover success/failure/provider-switch behavior.
