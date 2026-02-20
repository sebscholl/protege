# Project Status

Last Updated: 2026-02-19

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

1. TUI chat command (`protege chat`) is partially implemented (Phases A-C complete; Phases D-E in progress; Phase F in progress).

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
10. `protege chat` command and initial neo-blessed runtime wiring added (persona-scoped inbox/thread flow).

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

Remaining:

1. First-party `web_search` and `web_fetch` tools.
2. Scheduler responsibilities (`engine/scheduler` runtime + storage + tools).
3. Security/Ops completion (whitelist, recursion controls audit, terminal-failure notification flow).
4. Hooks runtime and dispatch (`extensions/hooks`).

## ADR Coverage

Recent status-aligned ADRs:

1. `docs/adr/0010-async-inbound-ack-and-harness-queue.md`
2. `docs/adr/0011-tool-implementation-isolation.md`
3. `docs/adr/0012-email-send-defaults-to-current-thread.md`
4. `docs/adr/0013-chat-tui-is-email-native-two-view-client.md`
5. `docs/adr/0014-chat-keybindings-ctrl-only-configured-in-system-json.md`
6. `docs/adr/0015-chat-v1-read-only-existing-threads-and-local-synthetic-writes.md`
