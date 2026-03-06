# Milestone 2 Planning Spec: Chat TUI (Email-Thread Client)

- Status: Implemented (v1 baseline)
- Date: 2026-02-19
- Scope owner: Protege team

## 1. Goal

Deliver `protege chat` as a terminal email-thread client.

`chat` does not introduce a new protocol. It is a UI layer over existing email-thread storage and gateway/harness behavior.

Success means an operator can:

1. Open an inbox-style thread list for a persona.
2. Open one thread in a dedicated thread view.
3. Start a new local chat thread from inside the TUI.
4. Send messages in TUI-created local chat threads using email semantics.
5. Toggle global render detail mode (light vs verbose).
6. Avoid accidental command triggers while composing text.

## 2. Key Decisions (Frozen for v1)

1. TUI library: `neo-blessed`.
2. Views: exactly two primary views in v1:
   - Inbox view (thread list)
   - Thread view (single thread + composer)
3. No split-pane inbox+thread in v1.
4. Thread view supports explicit return to inbox.
5. Send shortcut: `Ctrl+S`.
6. Shortcut policy: `Ctrl` only (cross-platform), no `Cmd`-specific bindings.
7. Shortcut configuration lives in `configs/system.json`.
8. Display mode toggle is global for the full chat session:
   - `light`
   - `verbose`
9. Compose safety model is mandatory:
   - when composing, plain text keys never trigger command actions.
10. Existing threads are read-only in v1.
11. Writable chat flow in v1 is only for TUI-created local synthetic threads.

## 3. Scope and Non-Goals

In scope:

1. Persona-targeted session start.
2. Thread listing and thread opening.
3. Thread timeline rendering.
4. New-thread creation action from inbox view.
5. Reply composition and send action dispatch for TUI-created local threads.
6. Global mode toggle (light/verbose).
7. Basic refresh and operator diagnostics.

Out of scope for v1:

1. Full multi-pane mailbox client feature set.
2. Rich attachment preview/rendering.
3. Search UX and advanced filtering.
4. Inline HTML rendering.
5. Notifications outside terminal session.
6. Writing/sending from existing (non-local-chat) threads.

## 4. Command Surface (Planned)

1. `protege chat --persona <persona_id_or_discriminator>`
2. Optional `--thread <thread_id>` for direct open.
3. Optional `--mode <light|verbose>` for startup default (overrides system default for session only).

## 5. View Model and UX Flow

## 5.1 Inbox View

Purpose: show recent threads for one persona.

Shows:

1. Subject
2. Sender/participants summary
3. Last message preview
4. Last activity timestamp

Actions:

1. Select thread
2. Open thread
3. Refresh list
4. Toggle display mode
5. Quit

## 5.2 Thread View

Purpose: show one thread timeline and compose reply.

Shows:

1. Message timeline
2. Composer input area
3. Session status line (persona, thread, mode, key hints)

Actions:

1. Back to inbox
2. Compose reply
3. Send reply (`Ctrl+S`)
4. Refresh thread
5. Toggle display mode
6. Quit

Write policy:

1. Existing threads are read-only in v1.
2. TUI-created local chat threads are writable.
3. Thread view must clearly render read-only vs writable state.

## 6. Input Safety Model

Two internal interaction modes are required in thread view:

1. Compose mode
   - Default while text input is focused.
   - Printable characters and normal keys append/edit draft only.
   - No single-key command actions are active.
   - Only explicit control chords are active (for example `Ctrl+S` send).
2. Command mode
   - Entered intentionally (for example `Esc`).
   - Navigation and non-compose commands are active.
   - Return to compose mode via explicit key (for example `i`) or focus action.

Acceptance requirement: typing normal prose must not trigger navigation, refresh, mode switch, or quit.

## 7. Display Modes

## 7.1 Light Mode

Focus on conversational readability.

Show per message:

1. Sender display name (or mailbox local-part fallback)
2. Timestamp (compact)
3. Body content

Hide metadata-heavy headers by default.

## 7.2 Verbose Mode

Focus on operational/debug clarity.

Show per message:

1. From
2. To
3. CC (if present)
4. Subject
5. Date
6. Message-ID
7. In-Reply-To and References when present
8. Body content

Mode is global and persists across inbox/thread views for the running session.

## 8. Data and Runtime Integration

Data source:

1. Persona-scoped `memory/{persona_id}/temporal.db`.

Addressing for local chat threads:

1. Synthetic user mailbox identity: `user@localhost`.
2. Persona recipient uses current persona mailbox identity (same as normal email interactions).

Local-thread bootstrap:

1. Triggered by TUI new-thread action from inbox view.
2. Creates synthetic inbound message:
   - `from = user@localhost`
   - `to = persona current mailbox identity`
   - `subject = Local Chat <timestamp>`
   - synthetic `message-id`
3. Persists message and enqueues harness through existing async path.
4. Harness/tool-driven outbound reply targets `user@localhost`.

Thread list query shape:

1. Thread id
2. Last subject
3. Last sender
4. Last activity timestamp
5. Last body preview
6. Message count

Thread detail query shape:

1. Message order by received/sent timestamp
2. Direction (`inbound|outbound`)
3. Envelope metadata for verbose mode
4. Body text/html fallback handling

Send behavior:

1. Chat reply dispatches through existing runtime action path (`email.send`).
2. Reply defaults must preserve current thread semantics per ADR 0012.
3. Send action is enabled only for TUI-created local chat threads in v1.

Refresh model:

1. Periodic polling (configurable interval) plus manual refresh key.
2. No new protocol channel introduced for chat.

## 9. `system.json` Additions (Planned)

Planned top-level shape:

```json
{
  "chat": {
    "default_display_mode": "light",
    "poll_interval_ms": 1500,
    "keymap": {
      "send": "ctrl+s",
      "refresh": "ctrl+r",
      "toggle_display_mode": "ctrl+v",
      "quit": "ctrl+q",
      "move_selection_up": "up",
      "move_selection_down": "down",
      "open_thread": "enter",
      "back_to_inbox": "esc"
    }
  }
}
```

Validation requirements:

1. Required chat actions must be present.
2. Duplicate keybinding conflicts are rejected with actionable startup errors.
3. Unsupported combos are rejected clearly.
4. `Ctrl` combos are canonical in v1.

## 10. Testing Strategy

## 10.1 Unit

1. Keymap parse/validation.
2. Conflict detection.
3. Mode toggle behavior (global light/verbose).
4. Compose safety guardrails.

## 10.2 State/Controller

1. Inbox->thread->inbox transitions.
2. Compose mode vs command mode transitions.
3. `Ctrl+S` send preconditions and outcomes.
4. Refresh and quit flows.

## 10.3 Integration (Headless)

1. Simulated key event streams over chat controller.
2. View-model assertions for inbox and thread rendering states.
3. Failure scenarios:
   - send failure
   - db read failure
   - invalid keymap config

## 10.4 Manual

1. Linux terminal validation.
2. macOS terminal validation (using `Ctrl` mappings only).
3. Verify normal prose typing never fires unintended commands.

## 11. Phased Execution Plan

1. Phase A: chat config + keymap parser + validation.
2. Phase B: inbox view data queries + rendering.
3. Phase C: thread view renderer + compose/editor model.
4. Phase D: send action wiring + error handling.
5. Phase E: polish (mode toggle, help hints, refresh behavior) + docs.

## 12. Exit Criteria

1. `protege chat` supports persona-scoped inbox/thread workflow end-to-end.
2. TUI can create a new local chat thread from inbox view.
3. Replies in local chat threads are sent via email action path and thread correctly.
4. Global verbose/light toggle works in both views.
5. Keybindings are configurable via `system.json`.
6. Compose safety model is verified with automated tests and manual checks.
7. Existing threads remain read-only and clearly labeled as such.

## 13. Post-Implementation Notes

1. Thread timeline rendering in v1 uses dot-prefixed message groups with inset body/attachment lines for readability.
2. Inbox thread subject labels are pinned to canonical thread root subject to avoid model-generated reply subjects renaming local chat threads.
3. Provider-specific chat reliability fixes were completed for Gemini tool-call roundtrip behavior.
