# Project Status

Last Updated: 2026-02-27

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
9. Guided onboarding command foundation:
   - `protege setup` (discrete onboarding command; non-interactive flag flow)

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
2. First production tools:
   - `send_email`
   - `read_file`
   - `write_file`
   - `edit_file`
   - `glob`
   - `search`
   - `shell`
   - `web_fetch`
   - `web_search`
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

1. Scheduler responsibilities runtime completion (`engine/scheduler` concurrency controls and E2E coverage hardening).
2. Security/Ops completion (whitelist, recursion controls audit, terminal-failure notification flow).
3. Hooks runtime and dispatch (`extensions/hooks`).
4. Scheduler hardening follow-up:
   - add explicit no-overlap and global concurrency controls
   - expand gateway+scheduler E2E reliability coverage
5. Onboarding/configuration hardening milestone:
   - tool manifest config deep-merge
   - env-only secret policy cleanup
   - relay-first default outbound validation
   - guided init wizard

Planning updates:

1. Scheduler milestone plan created: `docs/milestones/scheduler-plan.md`.
2. File-first responsibility model + DB runtime index frozen via ADR-0016.
3. Scheduler v1 run policy frozen via ADR-0017 (new thread per run, no retry, owner failure alert).
4. Scheduler runtime ownership boundary frozen via ADR-0018 (gateway-owned network/runtime).
5. Scheduler runtime and CLI were aligned to ADR-0018:
   - scheduler runtime now runs inside gateway process
   - scheduler CLI is control-plane sync only
6. `web_fetch` v1 boundary frozen via ADR-0023 (URL-first, no API key, bounded readable extraction).
7. `web_fetch` tests-first plan created: `docs/milestones/web-fetch-plan.md`.
8. `web_fetch` runtime/tool implementation completed with fixture-backed gateway/runtime coverage.
9. `web_search` provider-agnostic boundary frozen via ADR-0024 (config-selected adapters and normalized outputs).
10. `web_search` tests-first plan created: `docs/milestones/web-search-plan.md`.
11. `web_search` runtime/tool implementation completed with Tavily + Perplexity adapter coverage.
12. File/discovery runtime actions are unsandboxed in v1 (ADR-0025), while shell `workdir` boundary remains enforced.
13. Onboarding hardening plan created: `docs/milestones/onboarding-hardening-plan.md`.
14. Tool config model frozen to manifest-driven deep-merge overrides via ADR-0026.
15. Secrets/config surface cleanup policy frozen via ADR-0027.
16. Guided init wizard scope frozen via ADR-0028.
17. OH1 implemented:
   - `extensions/extensions.json` now supports object tool entries with `{ name, config }`
   - `web_search` now resolves default config in code and deep-merges manifest overrides
   - invalid tool manifest object entry shapes now fail with explicit validation errors
18. OH2 implemented:
   - scaffolded `config/inference.json` now uses provider `api_key_env` references
   - scaffolded `config/system.json` now defaults `admin_contact_email` to blank
   - `protege init` no longer scaffolds `config/inference.local.example.json`
   - `.env.example` reduced to secret credential keys only
   - CLI dotenv loading now applies `.env` then `.env.local`, while preserving shell-defined env values
19. OH3 implemented:
   - `relay bootstrap` now replaces scaffold `mailDomain: localhost` with inferred relay mail domain
   - bootstrap now reconciles persona sender emails to the relay mail domain
   - doctor now validates relay-enabled persona sender domain consistency
20. OH4 implemented:
   - relay now emits delivery control messages (`relay_delivery_result`) back to originating websocket sessions
   - gateway relay clients consume delivery control messages and resolve strict runtime delivery status when available
   - relay runtime action path now distinguishes queued-vs-sent semantics based on delivery signal capability
   - delivery-signal timeout no longer triggers duplicate resend loops; timeout now downgrades to queued/indeterminate with explicit timeout logging
21. OH5 implemented:
   - `send_email` now supports attachment descriptors (`path`, optional `filename`, optional `contentType`)
   - gateway `email.send` payload translation validates and forwards attachment descriptors to outbound requests
   - SMTP and relay MIME rendering paths now include outbound attachments
22. OH6 design completed:
   - bounded tool-failure recovery loop policy frozen via ADR-0029
   - recovery budget and stop conditions are now explicitly defined before implementation
23. Harness tool-loop recovery implemented:
   - tool-call failures are now returned to the model as structured tool-result errors (including stack preview) instead of immediate run termination
   - provider loop can continue after recoverable tool failures, allowing follow-up tool selection/correction in the same run
   - non-recoverable tool failures still fail fast (unknown tool, unsupported runtime action, missing outbound transport)
   - tool-loop max turn budget is now configurable via `inference.max_tool_turns` (default `8`)
24. OH7 started:
   - dedicated `protege setup` command added as isolated onboarding module
   - `init` remains scaffold-only
   - setup currently supports non-interactive flags for provider, outbound mode, relay URL, web-search provider, env key writes, persona bootstrap, and optional doctor report
   - bare `protege setup` now runs interactive prompts by default; `--non-interactive` is available for automation
25. Scheduler hardening planning initialized:
   - concurrency/no-overlap policy frozen via ADR-0031
   - run outcome/observability policy frozen via ADR-0032
   - detailed execution checklist created in `docs/milestones/scheduler-hardening-checklist.md`
26. Scheduler SH2 initial implementation:
   - `skipped_overlap` outcomes are now persisted when cron ticks are blocked by overlap guardrails
   - scheduler failed runs now persist `failure_category` metadata for diagnostics

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
10. `docs/adr/0019-persona-owned-sender-identity-and-no-active-persona.md`
11. `docs/adr/0020-core-file-tools-v1-simple-literal-reliable-semantics.md`
12. `docs/adr/0021-glob-and-search-tools-v1.md`
13. `docs/adr/0022-shell-tool-v1.md`
14. `docs/adr/0023-web-fetch-tool-v1.md`
15. `docs/adr/0024-web-search-provider-agnostic-v1.md`
16. `docs/adr/0025-file-and-discovery-runtime-actions-unsandboxed-v1.md`
17. `docs/adr/0026-tool-config-manifest-deep-merge.md`
18. `docs/adr/0027-secrets-env-and-single-config-surface.md`
19. `docs/adr/0028-init-wizard-guided-onboarding.md`
20. `docs/adr/0029-bounded-tool-failure-recovery-loop.md`
21. `docs/adr/0030-setup-wizard-command-separation.md`
22. `docs/adr/0031-scheduler-concurrency-and-no-overlap-policy.md`
23. `docs/adr/0032-scheduler-run-outcome-and-observability-policy.md`
