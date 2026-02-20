# ADR 0013: Chat TUI Is an Email-Native Two-View Client

- Date: 2026-02-19
- Status: Accepted
- Technical Story: Implement `protege chat` without introducing protocol or architecture drift

## Context

Protege is email-native by design. The TUI should not create a parallel chat protocol. We need a practical v1 interface for conversational workflows while preserving existing email-thread semantics and keeping implementation complexity controlled.

## Decision

1. `protege chat` is a terminal client over existing email-thread data and runtime actions.
2. No new communication protocol is introduced for TUI.
3. v1 UI structure is two-view:
   - inbox thread list view
   - single-thread detail/composer view
4. Thread view must support explicit return to inbox view.
5. Chat replies dispatch through existing runtime action path and preserve email threading behavior.

## Consequences

Positive:

1. Product remains aligned with email-native architecture.
2. Implementation can reuse temporal memory and existing gateway/harness send path.
3. Complexity stays moderate versus full mailbox-client UX.

Tradeoffs:

1. v1 omits richer mailbox features (search panes, attachment UI, etc.).
2. Poll-based refresh is sufficient but not real-time push in v1.

## Alternatives Considered

1. Split-pane inbox+thread single screen:
   - more dense UX, higher complexity and visual clutter for v1.
2. New chat protocol/socket transport for TUI:
   - conflicts with email-native architecture.
3. Full inbox-grade TUI from day one:
   - higher development/maintenance cost than needed for current milestone.
