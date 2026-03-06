# Project Status

Last Updated: 2026-03-06

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
3. Provider adapters implemented for OpenAI, Anthropic, Gemini, and Grok.
4. Thread history persistence/retrieval and context assembly.
5. Tool registry + tool execution loop.
6. `send_email` tool integrated through runtime actions.
7. Default same-thread reply behavior (`reply_current`) with explicit `threadingMode: "new_thread"` escape hatch.
8. Operator CLI diagnostics commands:
   - `protege status`
   - `protege logs`
   - `protege doctor`
9. Project scaffolding command:
   - `protege init`
10. Guided onboarding command foundation:
   - `protege setup` (discrete onboarding command; non-interactive flag flow)

Remaining:

1. Chat UX polish (advanced navigation/search, richer compose ergonomics).
2. Provider parity hardening across model families and tool-calling edge cases.

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
13. Chat rendering/UI polish additions:
   - thread message timeline uses themed dot-prefixed message headers
   - thread message body/attachment lines are inset for readability
   - inbox thread titles now remain pinned to canonical thread root subject (model reply subjects no longer rename chat threads)
14. Provider parity progress:
   - Gemini adapter hardened for provider-specific tool schema constraints (`additionalProperties` stripping)
   - Gemini tool-call roundtrip stabilized with provider metadata passthrough (`functionCall.id`/`functionResponse.id`)
   - Grok adapter added with fixture-backed tool-call and error-path coverage

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

1. Security/Ops completion (recursion controls audit and final access-control policy expansion beyond gateway sender rules, if needed).
2. Chat UX polish (advanced navigation/search and richer compose ergonomics).

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
   - scaffolded `configs/inference.json` now uses provider `api_key_env` references
   - scaffolded `configs/system.json` now defaults `admin_contact_email` to blank
   - `protege init` no longer scaffolds `configs/inference.local.example.json`
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
27. Scheduler SH3 completion:
   - terminal config failures now emit `scheduler.run.failed` structured events (parity with runtime/unknown failures)
   - scheduler runner failure taxonomy coverage added for unknown terminal errors and failure-alert dispatch boundaries
28. Scheduler SH4 reliability coverage (initial e2e slice):
   - new `tests/e2e/scheduler-reliability.test.ts` validates scheduler-run relay egress, overlap-skip persistence, and terminal failure alert emission
   - scheduler-driven failure runs now assert persisted failure category and alert-path behavior through gateway runtime actions
29. Scheduler SH4 reliability coverage expanded:
   - explicit e2e validation for concurrent execution of two distinct responsibilities under global scheduler cap
   - explicit e2e validation that long-running responsibilities block duplicate enqueue attempts via overlap guardrail
30. Setup wizard hardening (OH7 slice):
   - wizard interaction contract frozen in `docs/milestones/setup-wizard-spec.md`
   - setup validation now enforces relay websocket URL protocol and admin-contact email shape
   - setup reruns now hydrate defaults from existing project config/env/manifest to prevent accidental reset drift
31. Pretty-log theming improvements:
   - pretty console mode now renders multiline, indented key/value context rows for readability
   - ANSI styling is now theme-driven via `configs/theme.json` and `theme_config_path` in `configs/system.json`
32. Scheduler restart recovery hardening:
   - scheduler startup now finalizes interrupted `running` rows as `failed` (`failure_category=runtime`) to prevent permanent overlap-lock after gateway restarts
33. Chat inbox theming:
   - inbox list row styling now resolves entirely from `configs/theme.json` (`chat_ui.inbox`) including line tags and selected-row colors
34. CLI output contract hardening:
   - command output now defaults to pretty-readable mode with explicit `--json` opt-in
   - top-level and subcommand help content is file-backed under `engine/cli/*.help.txt`
   - shared CLI table rendering now powers status/persona/scheduler/init/setup pretty outputs
35. Gateway access-control security baseline:
   - gateway sender access policy moved to dedicated `configs/security.json`
   - deny-first wildcard policy evaluation is enforced during inbound gateway processing before persistence/enqueue
   - local chat remains trusted and unaffected by gateway access policy enforcement
36. Hooks implementation planning initialized:
   - hook manifest and dispatch contract frozen via ADR-0033
   - hooks milestone checklist created in `docs/milestones/hooks-plan.md`
37. Hooks runtime and dispatch completed:
   - manifest-driven hook loading supports string/object entries with default-config deep merge
   - typed hook event contract added (`engine/harness/hooks/events.ts`) and applied at dispatch boundary
   - logger emission now fans out non-blocking hook dispatch in gateway/chat runtimes with failure isolation
   - edge-case tests added for slow hooks, failing hooks, wildcard/exact subscriptions, and manifest-order execution
   - e2e observer coverage added via `tests/e2e/hooks-observer.test.ts`
38. Memory synthesis hooks and chained events completed:
   - default hooks enabled in manifest:
     - `thread-memory-updater` on `harness.inference.completed`
     - `active-memory-updater` on `memory.thread.updated`
   - hook dispatcher now supports chained event emissions returned from hook callbacks
   - thread-memory and active-memory synthesis state tables added (`0005_memory_synthesis_state.sql`)
   - provider-backed memory synthesis prompt files shipped under `prompts/`
   - unit + e2e coverage added for storage, hook behavior, and chained event flow
39. Context-loading planning initialized:
   - layered, file-first context model frozen via ADR-0034
   - milestone checklist created in `docs/milestones/context-loading-plan.md`
40. Context pipeline migration (CP1-CP5 initial slice) implemented:
   - `configs/context.json` scaffold added with ordered `thread` and `responsibility` profiles
   - resolver manifest support added to `extensions/extensions.json` with normalization + registry loading
   - shipped resolver modules added under `extensions/resolvers/*` (`system-prompt`, `persona-prompt`, `active-memory`, `thread-memory-state`, `invocation-metadata`, `knowledge-guidance`, `thread-history`, `current-input`)
   - harness runtime now builds context through resolver pipeline; legacy fallback path removed
   - harness topology cleanup landed with compatibility shims:
     - `engine/harness/context/history.ts` (+ `engine/harness/context.ts` shim)
     - `engine/harness/tools/registry.ts` (+ `engine/harness/tool-registry.ts` shim)
     - `engine/harness/hooks/registry.ts` (+ `engine/harness/hook-registry.ts` shim)
40. Context pipeline validation coverage added:
   - `tests/engine/harness/context-config.test.ts`
   - `tests/engine/harness/context-pipeline.test.ts`
   - `tests/engine/harness/resolver-registry.test.ts`
   - regression suites remain green across harness/gateway/scheduler/e2e slices.
41. Holistic context-management planning expanded:
   - end-to-end scenario plan added in `docs/milestones/context-management-plan.md` covering thread, responsibility, and relationship-aware context profiles
42. Context-management planning refined:
   - async memory synthesis model added (post-turn thread-memory updates + cadence/debounced active-memory updates), with inference reading committed snapshots only
43. Tool-trace continuity planning initialized:
   - persistence and causal ordering policy frozen via ADR-0035
   - implementation checklist created in `docs/milestones/tool-trace-persistence-plan.md`
42. Context API planning refined:
   - context pipeline config is now explicitly resolver-call syntax (`<name>` and `<name>(arg1, ...)`)
   - shipped and custom dynamic loaders are unified under the same resolver contract
43. Context pipeline migration initiated:
   - ADR-0036 accepted for resolver-extension boundary and harness module topology
   - migration checklist added in `docs/milestones/context-pipeline-filesystem-migration-checklist.md`
44. Context pipeline migration completion:
   - runtime entry points (gateway/chat/scheduler) now all route through one harness context pipeline path
   - integration coverage added for thread vs responsibility profile selection (`tests/e2e/context-profile-integration.test.ts`)
45. Memory synthesis strategy frozen:
   - both thread and active memory synthesis are hook-driven default extensions
   - sequencing is chained by events (`harness.inference.completed` -> `memory.thread.updated` -> active-memory flow)
   - active-memory updates use DB-backed dirty-state coalescing
   - per-hook provider/model override and prompt-path configuration are required
   - decision captured in `docs/adr/0037-memory-synthesis-hooks-and-chained-events-v1.md`
46. Memory synthesis failure/restart hardening completed:
   - startup recovery sweep added (`engine/harness/hooks/recovery.ts`) and invoked during gateway startup
   - dirty personas now receive synthetic `memory.thread.updated` re-dispatch after process restarts
   - e2e coverage added for failed active-memory synthesis followed by successful startup recovery (`tests/e2e/memory-synthesis-recovery.test.ts`)

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
24. `docs/adr/0033-hooks-manifest-and-async-dispatch-v1.md`
25. `docs/adr/0037-memory-synthesis-hooks-and-chained-events-v1.md`
