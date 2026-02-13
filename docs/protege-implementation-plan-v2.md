# Protege: Implementation Plan (v2)

This version incorporates product decisions from discovery.

## Locked Product Decisions

1. Primary v1 user: anyone with basic terminal competency.
2. Default onboarding path: relay-first.
3. Local direct SMTP mode: advanced path users can graduate to.
4. Provider model: pluggable adapters for OpenAI, Anthropic, Gemini, Grok.
5. Local data protection: no encryption-at-rest in v1.
6. Extension trust: trusted in-process execution ("sharp knives").
7. Reliability bar: no silent failures, retry up to 3x, notify owner on terminal failure.
8. Relay scope: stay minimal; relay email only, no full user account/sign-in domain model.

## Architecture Shape for v1

### Relay identity model (minimal)

- The relay tracks `agent identity`, not `user identity`.
- Each agent gets credentials like:
  - `subdomain`
  - `token`
- The relay stores a simple mapping: `subdomain -> token hash + connection metadata`.
- No sign-up/sign-in. No concept of "how many agents per user".
- If someone creates multiple Proteges, they are just multiple independent agent identities.

### Consequence

This keeps relay logic narrow while still allowing multiple agents in practice without introducing account systems.

## Phase Plan

## 0) Decision Freeze and ADRs (No Code)

1. Write ADRs for:
   - Relay identity model (agent-centric, no accounts)
   - Provider adapter contract
   - Trusted in-process extension model
2. Define explicit v1 non-goals:
   - no extension sandboxing
   - no local encryption-at-rest
   - no relay analytics/account dashboard
3. Freeze CI baseline (`lint`, `typecheck`, `test`).

Exit:
- ADRs approved.
- Non-goals documented.

## 1) Foundation

1. Scaffold canonical folder structure from spec.
2. Add config schema validation and `.env.example`.
3. Add shared logging and error primitives.
4. Add SQLite bootstrap + migrations framework.

Exit:
- Fresh install passes quality gates.

## 2) Milestone 1: Gateway Proof (Local)

1. Build inbound SMTP server (local port 2525 for dev).
2. Parse inbound MIME via `mailparser` into normalized internal message object.
3. Build outbound sender via `nodemailer`.
4. Implement deterministic threading headers.
5. Wire inbound -> auto reply path (hardcoded content).

Exit:
- Round-trip email works and threads correctly.

## 3) Milestone 2: Harness + Memory + TUI

1. Implement harness pipeline around normalized message object.
2. Implement provider-agnostic inference interface (details below).
3. Add thread/history persistence and retrieval.
4. Add context-window truncation strategy.
5. Build `protege chat` as thin email-thread client (dev/debug first).

Exit:
- Stateful conversations work via both email and TUI.

## 4) Milestone 3: Relay-first Public Reachability

1. Build relay WS server + `auth` handshake.
2. Tunnel raw SMTP over WS binary frames.
3. Build local gateway relay client with reconnect/backoff.
4. Add minimal token issuance endpoint for installer.
5. Add `create-protege` bootstrap CLI writing relay credentials to `.env`.

Exit:
- External mailbox -> relay -> local bot -> reply works end-to-end.

## 5) Milestone 4: Extensions, Scheduler, Security/Ops

1. Trusted in-process extension loader via `extensions.json`.
2. Ship first-party `web_search` and `web_fetch` tools.
3. Build scheduler responsibilities + cron runner + retry behavior.
4. Implement whitelist matching and recursion-depth safeguards.
5. Implement hook loading and dispatch.

Exit:
- Fully featured agent behavior from the final specification is operational.

## Provider Adapter Contract (v1 target)

Each provider adapter should expose one normalized contract:

1. `generate()` for plain responses.
2. `generateWithTools()` for tool-calling turn orchestration.
3. `generateStructured()` for schema-constrained JSON output.

Required adapter responsibilities:

1. Translate internal request format -> provider API shape.
2. Translate provider response -> internal normalized response.
3. Normalize errors into shared error taxonomy.
4. Emit usage metadata (tokens, model, latency if available).

v1 rule:

- If a provider lacks true feature parity, adapter must fail explicitly and predictably (no silent capability downgrade).

## Test Strategy by Phase

1. Unit tests for parsers, adapters, policy logic.
2. Integration tests for SMTP ingress/egress and threading.
3. Relay integration tests for auth, reconnect, and stream piping.
4. End-to-end smoke test from external provider inbox.

## Remaining Open Questions (Must Resolve Before Coding)

1. Relay anti-abuse without accounts:
   - What is the issuance control for subdomain/token creation? (open endpoint, invite code, local admin key, manual provisioning)
2. Subdomain lifecycle:
   - Are subdomains permanent, recyclable, or user-resettable?
3. Provider feature baseline:
   - Do we require all 4 providers to pass `generateWithTools` and `generateStructured` before v1 release, or allow phased support with capability flags?
4. TUI command surface:
   - Minimum v1 commands beyond chat (`status`, `logs`, `doctor`, `config`)?
5. Attachment handling in v1:
   - reply behavior when inbound includes files (ignore, summarize metadata, or parse selected MIME types)?
