# Protege: Implementation Plan (v1)

This plan translates the specification and sequencing documents into an execution path with explicit decision points, measurable exits, and risk controls. It is intentionally front-loaded toward architectural clarity and protocol correctness.

## 0. Product Framing (No Code)

**Objective:** Align on v1 scope boundaries and success criteria before repository scaffolding.

### Steps
1. Confirm target user profile for v1 (solo developer, technical self-hosters, broader non-technical users).
2. Define v1 non-goals (e.g., no vector DB, no multi-tenant local bot, no GUI beyond TUI).
3. Choose core stack decisions and freeze for v1:
   - Runtime and language (`Node.js + TypeScript` assumed).
   - Package manager.
   - Test runner and assertion library.
   - Logging format (`jsonl` vs pretty + file).
4. Define v1 reliability SLOs:
   - Reply success rate target.
   - Max acceptable end-to-end response latency.
   - Recovery time after relay disconnect.
5. Define security baseline:
   - Secret handling policy.
   - Local data encryption policy (if any) for `memory/`.

### Exit Criteria
- One-page Architecture Decision Record (ADR) bundle approved.
- Signed-off v1 success metrics and non-goals.

---

## 1. Project Foundation

**Objective:** Create a clean skeleton that enforces the architecture from day one.

### Steps
1. Initialize monorepo or single-package structure (decide explicitly).
2. Create the canonical directory layout from spec.
3. Add `README.md` with local dev quickstart and architecture map.
4. Add `.env.example` and config templates (`configs/inference.json`, `prompts/system.md`).
5. Add lint/format/test/typecheck scripts and CI workflow.
6. Add structured error model (`AppError` hierarchy) and shared utilities.

### Exit Criteria
- Fresh clone can run `install`, `test`, and `typecheck` successfully.
- Directory shape matches specification exactly.

---

## 2. Milestone 1 Implementation: Local Gateway Proof

**Objective:** Prove reliable inbound/outbound email threading without LLM complexity.

### Steps
1. Implement inbound SMTP server on local dev port (2525).
2. Parse messages via `mailparser` into normalized internal envelope.
3. Persist raw MIME + parsed summary into `memory/` logs for debugging.
4. Implement outbound sender using `nodemailer`.
5. Construct reply threading headers (`Message-ID`, `In-Reply-To`, `References`) deterministically.
6. Add integration script for end-to-end local roundtrip with fixtures.
7. Add manual verification checklist using Thunderbird or swaks.

### Exit Criteria
- Inbound message is parsed and normalized without crashes.
- Reply lands threaded correctly in at least 2 mail clients.
- Known edge cases documented (missing subject, multipart/alternative, attachments).

---

## 3. Milestone 2 Implementation: Harness Core

**Objective:** Build inference loop around real inbound email objects.

### Steps
1. Implement configuration loader with schema validation.
2. Initialize SQLite (`better-sqlite3`) and migrations system.
3. Create core tables:
   - `threads`
   - `messages`
   - `responsibilities` (stub fields only initially)
   - FTS5 virtual table for searchable content
4. Build LLM provider abstraction with one provider for v1.
5. Implement harness pipeline:
   - Input normalization
   - Prompt assembly
   - LLM call
   - Tool-call routing interface (no tools yet)
   - Final response rendering
6. Wire Gateway -> Harness -> Gateway reply path.
7. Persist message history by thread and use history in context window.
8. Add token budgeting/truncation strategy for long threads.
9. Build `protege chat` TUI as email-thread client over same pipeline.

### Exit Criteria
- Agent can hold a stateful multi-turn conversation over email thread.
- TUI and email produce consistent conversation records.
- History retrieval and truncation behavior are deterministic and tested.

---

## 4. Milestone 3 Implementation: Relay + Public Access

**Objective:** Enable public email reachability for users without inbound port 25.

### Steps
1. Implement relay WebSocket server with authenticated session binding by subdomain.
2. Implement SMTP stream tunneling over WS binary frames.
3. Add heartbeat/reconnect/backoff behavior in local bot relay client.
4. Add relay-side rate limiting and abuse controls.
5. Implement relay API for token/subdomain issuance.
6. Build installer CLI (`create-protege`) for bootstrap and credential provisioning.
7. End-to-end test from external mailbox to local bot via relay.

### Exit Criteria
- Remote email can reach local bot and receive response.
- Relay disconnects recover automatically.
- Subdomain auth failures are observable and actionable.

---

## 5. Milestone 4 Implementation: Tools, Scheduler, Security, Hooks

**Objective:** Complete autonomous and extensible behavior set.

### Steps
1. Implement extension manifest loader (`extensions/extensions.json`) with strict validation.
2. Implement tools runtime contract and capability boundaries.
3. Ship `web_search` and `web_fetch` as first-party extensions.
4. Implement scheduler runner with cron parsing + jitter + retry model.
5. Add LLM-manageable responsibility operations (create/list/update/disable).
6. Implement gateway sender access policy wildcard matching.
7. Implement recursion depth header strategy and enforcement.
8. Implement cross-cutting retry/backoff policy with owner notifications.
9. Implement hooks runtime and event dispatch points.

### Exit Criteria
- Responsibilities execute on schedule and send results reliably.
- Tools and hooks can be enabled/disabled without code changes.
- Security controls prevent unauthorized responses and recursion loops.

---

## 6. Hardening and Release Readiness

**Objective:** Prepare for stable early-user deployment.

### Steps
1. Add comprehensive integration test matrix:
   - SMTP parsing edge cases
   - Relay reconnect behavior
   - Threading header correctness
   - Scheduler timing behavior
2. Add operational observability:
   - Structured logs
   - Health endpoints (relay + local bot)
   - Diagnostics command (`protege doctor`)
3. Add backup/restore strategy for `memory/{persona_id}/temporal.db` and attachments.
4. Perform security review and dependency audit.
5. Add release packaging, versioning policy, and upgrade path.

### Exit Criteria
- Installer to first successful email reply in under 10 minutes for a clean machine.
- Test suite + smoke checks are green in CI.
- Runbook exists for common failures.

---

## Cross-Cutting Decision Gates

Gate A (before Phase 1): Single package vs monorepo.
Gate B (before Milestone 2): LLM provider abstraction depth for v1.
Gate C (before Milestone 3): Relay as separate repo/service vs same repo package.
Gate D (before Milestone 4): Extension sandboxing model (process isolation vs in-process).
Gate E (before release): Encryption-at-rest requirements for local memory.

---

## Suggested Execution Rhythm

1. One milestone per sprint (1-2 weeks each).
2. End each sprint with:
   - Demo (manual workflow)
   - Risk review
   - ADR updates
3. Freeze new features after Milestone 4 and spend one sprint on hardening.

---

## Definition of Done (Global)

1. Every milestone has runnable acceptance checks.
2. All config surfaces have schema validation and clear error messages.
3. No silent failures in gateway, harness, scheduler, or relay.
4. User can diagnose configuration and connectivity issues without reading source.
