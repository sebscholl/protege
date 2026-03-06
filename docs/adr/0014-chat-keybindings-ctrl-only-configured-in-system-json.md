# ADR 0014: Chat Keybindings Are Ctrl-Only and Configured in `system.json`

- Date: 2026-02-19
- Status: Accepted
- Technical Story: Safe, consistent TUI input model across platforms without accidental command triggers

## Context

Terminal key event behavior is inconsistent across platforms and terminal apps, especially for `Cmd` on macOS. Protege chat also needs strong safeguards so typing an email draft does not accidentally trigger app actions.

We need one binding model that is predictable, configurable, and testable.

## Decision

1. Chat keybindings in v1 use `Ctrl` combos as canonical modifier shortcuts.
2. `Cmd`-specific bindings are not supported in v1.
3. Keybindings are defined in `configs/system.json` under a dedicated `chat.keymap` section.
4. Chat rendering detail mode (`light|verbose`) is global to the session and toggled through configured keybinding.
5. Compose safety model is mandatory:
   - normal prose input does not trigger command actions.
6. Keymap conflicts and invalid combinations fail fast with explicit startup errors.

## Consequences

Positive:

1. Predictable behavior across Linux, Windows, and macOS terminal environments.
2. Operator customization without code changes.
3. Stronger protection against accidental action triggers while composing.

Tradeoffs:

1. Users expecting macOS `Cmd` shortcuts must adapt to `Ctrl` in terminal.
2. Keymap validation adds startup/config complexity.

## Alternatives Considered

1. Platform-specific default maps (`Cmd` on macOS, `Ctrl` elsewhere):
   - inconsistent terminal behavior and harder support/debug matrix.
2. Hard-coded non-configurable shortcuts:
   - simpler implementation, weaker operator ergonomics.
3. Vim-style single-key command model:
   - efficient for experts, higher accidental trigger risk during composition.
