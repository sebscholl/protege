# Project Status

Last Updated: 2026-02-25

This file tracks implementation progress against `docs/protege-development-sequencing-v2.md` and `docs/protege-implementation-plan-v3.md`.

## Overall

1. Milestone 1: Complete
2. Milestone 2: Mostly complete
3. Milestone 3: Complete (relay-first flow operational)
4. Milestone 4: In progress (early)
5. CLI packaging for npm distribution: In progress

## Milestone 1: Gateway

Status: Complete

Completed:

1. Local SMTP inbound listener and MIME parsing.
2. Attachment persistence in persona-scoped memory.
3. Outbound email with deterministic threading headers.
4. Inbound persistence + async harness enqueue model.
5. Gateway lifecycle CLI (`start|stop|restart`, `--dev`) and comprehensive tests.

## Milestone 2: Harness

Status: Mostly complete

Completed:

1. Persona-scoped temporal memory and active memory model.
2. Harness runtime loop with provider adapter boundary.
3. Thread history persistence/retrieval and context assembly.
4. Tool registry + tool execution loop.
5. `send_email` tool integrated through runtime actions.
6. Default same-thread reply behavior (`reply_current`) with explicit `threadingMode: "new_thread"` escape hatch.
7. Operator CLI diagnostics commands:
   - `protege status`
   - `protege logs`
   - `protege doctor`
8. Project scaffolding command:
   - `protege init`

Remaining:

1. Chat UX polish (advanced navigation/search, richer compose ergonomics).

Planning updates:

1. Chat planning spec created: `docs/milestones/chat-planning-spec.md`.
2. TUI architecture and keybinding policy frozen via ADR-0013 and ADR-0014.
3. Chat implementation checklist created: `docs/milestones/chat-implementation-checklist.md`.
4. Chat write policy frozen via ADR-0015 (existing threads read-only; writable local synthetic threads).
5. Chat Phase A implemented: `system.json` chat config contract, keymap validation, and conflict detection.
6. Chat Phase B implemented: persona-scoped thread summary/detail query layer with writable-thread classification.
7. Chat Phase C implemented: headless controller state machine with keymap-driven actions and compose safety guards.
8. Chat Phase D foundations implemented: inbox/thread view-model render helpers with explicit read-only/writable banner semantics.
9. Chat Phase E foundations implemented: local synthetic thread/message write services for `user@localhost` flow.
10. `protege chat` command and neo-blessed runtime wiring added (persona-scoped inbox/thread flow).
11. Chat send path stabilized:
   - default send binding moved to `Ctrl+S` with `Ctrl+Enter` legacy fallback
   - local `user@localhost` send path validated
   - OpenAI null-content request bug fixed
12. Chat rendering behavior improved:
   - mode and key status visibility
   - console log suppression in TUI surface (file logging retained)
   - thread scroll support + auto-scroll to bottom on open and submit

## Milestone 3: Relay and Public Access

Status: Complete

Completed:

1. Relay server with websocket auth and SMTP-over-WS tunneling.
2. Relay client in gateway with reconnect/backoff/heartbeat and auth gating.
3. Persona key-based bootstrap flow (`protege relay bootstrap`).
4. Relay deployment assets (`systemd`, `nginx`, sync/deploy scripts).
5. End-to-end relay tests and live manual verification with Gmail.
6. Direct-to-MX relay outbound egress plus deliverability docs (SPF/PTR baseline).

Notes:

1. Current bootstrap UX is CLI-based; `npx create-protege` installer UX remains future scope.

## Milestone 4: Full Feature Set

Status: In progress (early)

Completed:

1. Extension isolation boundary and manifest/registry flow.
2. First production tool: `send_email`.
3. Scheduler foundations:
   - responsibility file contract + frontmatter parser
   - file->DB index sync/reconcile flow
   - scheduler storage and run-record APIs
   - scheduler schema migration (`responsibilities` index + `responsibility_runs`)
4. Scheduler runtime foundations:
   - cron trigger registration + enqueue flow
   - runner single-cycle execution with synthetic inbound message creation
   - run success/failure transitions with failure-alert callback contract
   - gateway-owned global scheduler loop across all persona-owned responsibilities
5. Scheduler operator command surface:
   - `protege scheduler sync`
6. Scheduler relay-capable runtime action path integrated for tool-driven email sends.
7. Global runtime failure alert path hardened:
   - `admin_contact_email` now drives both scheduler failure alerts and gateway terminal inbound-failure alerts.

Remaining:

1. First-party `web_search` and `web_fetch` tools.
2. Scheduler responsibilities runtime completion (`engine/scheduler` concurrency controls and E2E coverage hardening).
3. Security/Ops completion (whitelist, recursion controls audit, terminal-failure notification flow).
4. Hooks runtime and dispatch (`extensions/hooks`).
5. Scheduler hardening follow-up:
   - add explicit no-overlap and global concurrency controls
   - expand gateway+scheduler E2E reliability coverage

Planning updates:

1. Scheduler milestone plan created: `docs/milestones/scheduler-plan.md`.
2. File-first responsibility model + DB runtime index frozen via ADR-0016.
3. Scheduler v1 run policy frozen via ADR-0017 (new thread per run, no retry, owner failure alert).
4. Scheduler runtime ownership boundary frozen via ADR-0018 (gateway-owned network/runtime).
5. Scheduler runtime and CLI were aligned to ADR-0018:
   - scheduler runtime now runs inside gateway process
   - scheduler CLI is control-plane sync only

## ADR Coverage

Recent status-aligned ADRs:

1. `docs/adr/0010-async-inbound-ack-and-harness-queue.md`
2. `docs/adr/0011-tool-implementation-isolation.md`
3. `docs/adr/0012-email-send-defaults-to-current-thread.md`
4. `docs/adr/0013-chat-tui-is-email-native-two-view-client.md`
5. `docs/adr/0014-chat-keybindings-ctrl-only-configured-in-system-json.md`
6. `docs/adr/0015-chat-v1-read-only-existing-threads-and-local-synthetic-writes.md`
7. `docs/adr/0016-responsibilities-file-first-with-db-index.md`
8. `docs/adr/0017-scheduler-v1-run-policy.md`
9. `docs/adr/0018-scheduler-runtime-owned-by-gateway.md`
