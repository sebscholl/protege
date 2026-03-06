# Protege: Implementation Plan (v3)

This version freezes the architecture decisions made during discovery.

Implementation progress is tracked in `docs/status.md`.

## Current Execution State

1. Milestone 1: complete.
2. Milestone 2: complete (core behavior shipped).
3. Milestone 3: complete.
4. Milestone 4: complete.
5. Current focus: launch readiness operations (release runbook, CI hardening, docs hosting).

## Frozen Product Decisions

1. Primary v1 user: anyone with basic terminal competency.
2. Default onboarding path: relay-first.
3. Local direct SMTP mode: advanced path users can graduate to.
4. Provider model: pluggable adapters for OpenAI, Anthropic, Gemini, Grok.
5. Local data protection: no encryption-at-rest in v1.
6. Extension trust: trusted in-process execution.
7. Reliability bar: no silent failures, retry up to 3x, notify owner on terminal failure.
8. TUI v1 commands: `chat`, `status`, `logs`, `doctor`.
9. Attachment handling v1: store files in `memory/{persona_id}/attachments/` when persona routing resolves, no deep parsing by default.
10. Public-key email encoding: lowercase `base32` (no padding) derived from `ed25519` public key.
11. Key storage: persona-scoped `passport.key` stored alongside persona configuration.
12. Persona routing: inbound routes explicitly by recipient address `{persona_pubkey}@<relay_mail_domain>`.
13. TUI targeting: user explicitly specifies intended persona for new conversations.
14. Relay abuse control in v1: IP rate limiting (and optional temporary IP blocks).
15. Memory naming split:
   - temporal memory in `memory/{persona_id}/temporal.db`
   - active memory in `memory/{persona_id}/active.md`
16. Inbound sequencing: persist and acknowledge SMTP quickly, then enqueue async harness execution.
17. Unified runtime logging: global `configs/system.json` controls log path and console format.
18. Tool-driven outbound email defaults to same-thread replies; explicit `threadingMode: "new_thread"` is required to start separate conversations.

## Relay Identity and Auth (Replaces Token-Issuance Model)

### Principle

Relay tracks `agent identity`, not `user accounts`.

### Identity model

1. Each Protege instance generates an `ed25519` keypair locally.
2. Public key is the durable agent identifier.
3. Agent email local-part is derived from public key (non-human-friendly by design) and used as routing identity.
4. No username selection, no editable vanity address.

### Registration/auth model

1. Client registers by proving control of private key (signature over relay challenge).
2. Relay stores minimal record keyed by public key.
3. Subsequent websocket auth uses challenge-response signatures (not static bearer tokens).
4. If private key is lost, agent must generate a new keypair and re-register.
5. If key material is compromised, the identity is considered burned; generate a new keypair and re-register.

### Relay data model (minimal)

- `public_key`
- `email_local_part` (derived)
- `created_at`
- `last_seen_at`
- `status` (active)
- minimal connection/session metadata

No sign-up/sign-in, no user profile, no multi-agent account management.
Relay abuse controls are network-level (IP rate limits and temporary IP blocklists), not key-identity moderation.

## Subdomain/Address Policy

1. Every agent has a unique, cryptic, non-editable address derived from its public key in the form `{persona_pubkey}@<relay_mail_domain>`.
2. Addresses are permanent for the lifetime of that keypair.
3. Lost keypair implies new identity/address.
4. Relay should not recycle prior addresses in v1.
5. No signed revoke/re-enable lifecycle in v1; rotation to a new identity is the recovery path.

## Provider Parity Policy

1. Adapters exist for OpenAI, Anthropic, Gemini, Grok.
2. All providers must implement the normalized capabilities:
   - `generate()`
   - `generateWithTools()`
   - `generateStructured()`
3. If a provider cannot support a capability, it must fail explicitly with a normalized error (no silent downgrade).

## Phase Plan

## 0) Decision Freeze and ADRs (No Code)

1. Write ADRs for:
   - keypair-based relay identity/auth
   - public-key-derived address policy
   - provider adapter contract and parity rule
   - trusted in-process extension model
2. Lock explicit v1 non-goals:
   - no extension sandboxing
   - no local encryption-at-rest
   - no relay account/dashboard system
3. Freeze CI quality gates (`lint`, `typecheck`, `test`).

Exit:
- ADR bundle approved.

## 1) Foundation

1. Scaffold canonical folder structure from spec.
2. Add config schema validation and `.env.example`.
3. Add shared logging and error taxonomy.
4. Add SQLite bootstrap + migrations.

Exit:
- Fresh install passes quality gates.

## 2) Milestone 1: Gateway Proof (Local)

1. Build inbound SMTP listener (dev port 2525) with prompt acknowledgement semantics.
2. Parse MIME with `mailparser` into normalized internal message object.
3. Build outbound sender with `nodemailer`.
4. Implement deterministic threading headers.
5. Wire inbound -> persisted message -> async harness pipeline.

Exit:
- Round-trip email works and threads correctly.

## 3) Milestone 2: Harness + Memory + TUI

1. Implement harness pipeline around normalized message objects.
2. Implement provider-agnostic adapter interface.
3. Add thread/history persistence and retrieval.
4. Add deterministic context truncation strategy.
5. Build `protege chat` plus `status`, `logs`, `doctor` commands.

Exit:
- Stateful conversations work via email and TUI.

## 4) Milestone 3: Relay-first Reachability

1. Implement relay websocket service.
2. Implement keypair registration and signature-based auth handshake.
3. Tunnel raw SMTP over WS binary frames.
4. Build reconnect/heartbeat/backoff in local relay client.
5. Build bootstrap CLI flow:
   - generate keypair
   - register public key
   - persist private key locally
   - write relay configuration

Exit:
- External mailbox -> relay -> local bot -> reply works end-to-end.

## 5) Milestone 4: Extensions, Scheduler, Security/Ops

1. Implement trusted in-process extension loading via `extensions.json`.
2. Ship first-party `web_fetch` first, then `web_search`.
3. Implement scheduler responsibilities + cron + retry.
4. Implement gateway sender access policy and recursion-depth safeguards.
5. Implement hooks loading and event dispatch.
6. Persist inbound attachments to `memory/{persona_id}/attachments/` with metadata.

Exit:
- Fully featured agent behavior from final spec is operational.

## Test Strategy

1. Unit tests: parser normalization, provider adapters, auth verification, policy logic.
2. Integration tests: SMTP ingress/egress, threading headers, relay stream piping.
3. Security tests: invalid signatures, replay attempts, IP-level abuse control behavior.
4. End-to-end smoke: external mailbox roundtrip via relay.

## Relay Abuse Policy (v1)

1. Primary relay protection is IP-level controls for availability.
2. Apply rate limiting; optional temporary IP blocks can be used operationally.
3. No proof-of-work in v1.
4. Do not rely on public-key blocking as a primary defense, since key rotation is trivial.
5. Key compromise/loss recovery path remains: generate a new keypair and re-register.
