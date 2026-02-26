# ADR-0023: Web Fetch Tool v1 Uses Native HTTP Fetch with Readable Text Extraction

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Add a zero-api-key web content retrieval tool that is simple, reliable, and broadly useful.

## Context

Protege needs an internet content tool that works out-of-the-box for self-hosted users without external search provider credentials. A full `web_search` capability usually depends on third-party APIs and keys, but `web_fetch` can provide immediate utility with no relay/provider dependency.

We need a minimal contract that is:

1. deterministic and easy for models to use
2. bounded for runtime safety (timeout/size limits)
3. generic enough to compose with later `web_search` results

## Decision

1. Add first-party tool `web_fetch` under `extensions/tools/web-fetch/`.
2. Map tool execution to runtime action `web.fetch`.
3. v1 input contract:
   - `url` (required, `http`/`https` only)
   - `maxBytes` (optional, bounded; runtime-enforced upper cap)
   - `timeoutMs` (optional, bounded; runtime-enforced upper cap)
4. v1 output contract:
   - `url` (final URL after redirects)
   - `status`
   - `contentType`
   - `title` (best-effort)
   - `text` (normalized readable text)
   - `truncated` (boolean)
5. v1 behavior constraints:
   - follow redirects with a bounded limit
   - reject non-HTTP(S) schemes
   - enforce timeout and byte limits
   - return typed errors for timeout, invalid URL/scheme, non-text content, and oversized payloads
6. Extraction scope in v1:
   - prioritize readable text from HTML and plain text responses
   - no browser execution or JS rendering
   - no authenticated/session crawling semantics

## Consequences

Positive:

1. Immediate web retrieval capability without API keys.
2. Strong complement to existing local file/shell tools.
3. Clear contract that can later compose with `web_search`.

Tradeoffs:

1. No discovery/ranking; callers must already have a URL.
2. Dynamic JS-heavy pages may return limited content.
3. Large/binary content must be rejected or truncated by design.

## Alternatives Considered

1. Build `web_search` first:
   - rejected for now due to provider dependency and key-management complexity.
2. Add both `web_search` and `web_fetch` together:
   - rejected to keep milestone increments small and testable.
3. Browser-driven fetch in v1:
   - rejected for complexity and runtime overhead.
