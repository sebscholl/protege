# Milestone Plan: Web Fetch Tool (`web_fetch`)

Status: In Progress  
Scope: First-party URL retrieval tool with bounded, readable text output and no external API-key dependency.

## Goals

1. Deliver a simple, robust `web_fetch` tool for URL-first retrieval.
2. Keep tool behavior deterministic and bounded for runtime safety.
3. Preserve extension isolation (tool-specific logic remains in tool directory).
4. Implement with tests first and fixture-backed network interception.

## Non-Goals (v1)

1. No search ranking/discovery (`web_search` is separate).
2. No browser rendering or JavaScript execution.
3. No authenticated/session-aware scraping workflow.
4. No binary download pipeline.

## Decision Anchor

1. `docs/adr/0023-web-fetch-tool-v1.md`

## WF1. Contract and Validation (Tests First)

Status: Complete

### Tasks

1. Define tool schema in `extensions/tools/web-fetch/index.ts`.
2. Validate required/optional inputs:
   - required `url`
   - optional bounded `maxBytes`
   - optional bounded `timeoutMs`
3. Return clear validation errors for unsupported schemes and malformed input.

### Tests

1. Accepts valid `http`/`https` URLs.
2. Rejects unsupported schemes (`file:`, `mailto:`, `javascript:`).
3. Rejects invalid URL syntax.
4. Enforces input bounds for `maxBytes` and `timeoutMs`.

## WF2. Runtime Action and Fetch Core (Tests First)

Status: Complete

### Tasks

1. Add runtime action `web.fetch` in gateway runtime invoker.
2. Implement bounded fetch with:
   - timeout
   - redirect cap
   - byte cap
3. Enforce content handling policy:
   - allow text/html and text/plain (and text-like variants)
   - reject unsupported binary-like responses in v1

### Tests

1. Returns normalized payload for successful HTML response.
2. Returns normalized payload for plain text response.
3. Fails with typed timeout error.
4. Fails when redirect cap is exceeded.
5. Fails for oversized responses (or marks truncation per contract).

## WF3. Readable Text Extraction (Tests First)

Status: Complete

### Tasks

1. Parse HTML and extract best-effort title + readable text.
2. Strip script/style/non-content noise.
3. Normalize whitespace and newline output.
4. Mark truncation deterministically when limits are reached.

### Tests

1. Extracts `<title>` when present.
2. Produces normalized text body from HTML fixture.
3. Produces expected plain text passthrough behavior.
4. Sets `truncated=true` when byte/content limits apply.

## WF4. Harness + Tool Loop Integration (Tests First)

Status: Complete

### Tasks

1. Register `web_fetch` via extension manifest/registry.
2. Ensure harness tool execution routes through generic runtime action invocation.
3. Ensure chat/gateway contexts can execute `web.fetch` through shared runtime path.

### Tests

1. Tool registry resolves `web_fetch` from `extensions/extensions.json`.
2. Tool call executes `web.fetch` and returns normalized result shape.
3. Integration path emits expected success/failure logs.

## WF5. Network Fixtures and Manual Verification

Status: In Progress

### Tasks

1. Add fixture-backed network coverage under:
   - `tests/fixtures/api/web/fetch/200-html.json`
   - `tests/fixtures/api/web/fetch/200-text.json`
   - `tests/fixtures/api/web/fetch/302-redirect.json`
   - `tests/fixtures/api/web/fetch/408-timeout.json`
   - `tests/fixtures/api/web/fetch/413-too-large.json`
2. Wire fixtures through `tests/network/` helper contract.
3. Add manual verification checklist in development guide after implementation.

### Tests

1. Runtime behavior remains deterministic across fixture responses.
2. Error taxonomy remains stable for timeout/oversize/invalid-content.

## Exit Criteria

1. `web_fetch` is available as an extension tool with documented contract.
2. Tool executes successfully from harness through runtime action `web.fetch`.
3. Bounded timeout/size/redirect behavior is enforced and tested.
4. Docs and status tracker reflect implementation and sequencing updates.
