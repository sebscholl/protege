# Chat

Extension Surface: No

This directory contains chat-domain runtime logic for `protege chat`.

It should include:

1. Persona-scoped chat query and controller logic.
2. TUI state orchestration for inbox/thread views.
3. Chat-specific rendering and interaction policies.

It should not include:

1. Gateway SMTP protocol handling.
2. Provider-specific inference code.
3. Tool implementations (these belong under `extensions/tools/`).
