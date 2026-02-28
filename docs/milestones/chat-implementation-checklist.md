# Chat Implementation Checklist

- Status: Implemented (v1 baseline)
- Date: 2026-02-19
- Depends on:
  1. `docs/milestones/chat-planning-spec.md`
  2. `docs/adr/0013-chat-tui-is-email-native-two-view-client.md`
  3. `docs/adr/0014-chat-keybindings-ctrl-only-configured-in-system-json.md`
  4. `docs/adr/0015-chat-v1-read-only-existing-threads-and-local-synthetic-writes.md`

## Phase A: Chat Config and Keymap

Status: Complete

Goal: establish chat config surface and validated keybindings.

Tasks:

1. Extend system config contract with `chat` section:
   - `default_display_mode`
   - `poll_interval_ms`
   - `keymap` action bindings
2. Add config parser/validator for chat settings.
3. Add keymap conflict detection and actionable errors.
4. Define normalized internal key action enum.

Tests:

1. Valid config parses successfully.
2. Missing required key action fails with clear error.
3. Duplicate key mapping fails with conflict details.
4. Invalid display mode fails with clear error.

Exit:

1. Chat config can be loaded independently.
2. Validation errors are deterministic and human-readable.

## Phase B: Chat Data Query Layer

Status: Complete

Goal: build persona-scoped thread and message query APIs.

Tasks:

1. Add thread list query service for inbox view model.
2. Add thread detail query service for timeline view model.
3. Add message preview normalization for light mode list rows.
4. Add metadata projection for verbose mode rendering.
5. Add thread writability classification:
   - existing thread = read-only
   - local synthetic thread = writable

Tests:

1. Thread list returns expected ordering and summary fields.
2. Thread detail returns chronological messages.
3. Persona isolation enforced in query layer.
4. Empty state responses are stable.

Exit:

1. Inbox and thread view can be rendered from query layer without gateway/harness coupling.

## Phase C: Chat Controller State Machine

Status: Complete

Goal: implement view transitions, compose safety rules, and global mode toggling.

Tasks:

1. Implement session state model:
   - current view (`inbox|thread`)
   - selected thread
   - interaction mode (`compose|command`)
   - global display mode (`light|verbose`)
2. Implement key event -> action mapping.
3. Implement inbox->thread->inbox transitions.
4. Implement safe compose handling:
   - prose keys mutate draft only
   - command actions gated by mode/chords
5. Enforce thread write policy in controller:
   - block send in read-only threads
   - allow send only in local synthetic writable threads

Tests:

1. View transition table coverage.
2. Compose mode blocks command actions on printable keys.
3. `Ctrl+V` toggles mode globally.
4. `Ctrl+Q` exits predictably.

Exit:

1. Headless controller supports all planned chat actions with deterministic state transitions.

## Phase D: TUI Rendering (neo-blessed)

Status: Complete

Goal: render inbox and thread views and bind them to controller state.

Tasks:

1. Implement screen bootstrap and teardown lifecycle.
2. Implement inbox list renderer.
3. Implement thread timeline renderer.
4. Implement composer input region and status bar hints.
5. Implement light/verbose rendering variants.
6. Render explicit read-only/writable state banner in thread view.

Tests:

1. Renderer smoke tests with synthetic state snapshots.
2. Keybinding dispatch integration test with simulated inputs.
3. Empty/error render states are stable.

Exit:

1. Operator can navigate from inbox to thread and back with keyboard only.
2. Global display mode visibly changes both views.

## Phase E: Send Action Wiring and Polling

Status: Complete

Goal: wire composer send action to existing runtime pipeline and keep view fresh.

Tasks:

1. On `Ctrl+S`, dispatch reply through existing runtime action path.
2. Ensure thread reply semantics reuse current-thread behavior.
3. Add polling refresh loop with configurable interval.
4. Add failure banners/messages for send/query failures.
5. Add `--thread` startup deep-link behavior.
6. Add inbox action to create local synthetic thread:
   - from `user@localhost`
   - to persona current mailbox identity
   - subject `Local Chat <timestamp>`

Tests:

1. Send action success path clears/retains draft per spec.
2. Send failure path surfaces actionable error and preserves draft.
3. Poll refresh updates inbox/thread views.
4. Thread deep-link loads expected initial view.
5. Send attempts on read-only threads are blocked with clear feedback.

Exit:

1. `protege chat --persona <id>` supports end-to-end reply workflow.
2. Replies persist and appear in thread history with expected threading metadata.

## Phase F: CLI Integration and Documentation

Status: Complete

Goal: expose chat command and finalize operator docs.

Tasks:

1. Add `chat` subcommand to CLI dispatcher and usage output.
2. Add chat section to `guide/cli.md`.
3. Add troubleshooting scenarios for chat keymap/config and send failures.
4. Update status docs after implementation.

Tests:

1. CLI usage includes `chat`.
2. `protege chat --help` or equivalent usage path is stable.
3. Invalid persona argument returns clear error.

Exit:

1. Chat command is discoverable in CLI docs and usage text.

## Post-Implementation Notes

1. Default send shortcut is `Ctrl+S`; `Ctrl+Enter` is kept as a legacy fallback for terminal variants.
2. Chat suppresses console log emission to avoid TUI corruption while continuing to write file logs.
3. Thread view supports scroll navigation (`Up/Down`, `PageUp/PageDown`, `Ctrl+U/Ctrl+D`) and bottom anchoring on open/submit.
4. Thread view now renders dot-prefixed message groups with inset body/attachment lines (separator lines removed).
5. Inbox summary subject labels now use canonical thread root subject to keep chat thread titles stable.

## Cross-Phase Quality Gates

For each phase:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test` (or focused test suites while iterating)

## Risks and Mitigations

1. Terminal key-event inconsistency:
   - Mitigation: strict normalized key parser + manual matrix for common terminals.
2. Accidental command triggers while composing:
   - Mitigation: explicit compose safety mode and regression tests.
3. Rendering complexity creep:
   - Mitigation: keep v1 to two views and defer advanced mailbox features.
