# ADR-0034: Context Loading Uses Layered, File-First Assembly with Persona Prompt

- Status: Accepted
- Date: 2026-02-28
- Deciders: Protege team
- Technical Story: Normalize context assembly across email/chat/scheduler while making persona intent explicit and editable.

## Context

Harness context is currently assembled from system prompt, active memory, thread history, and inbound text. As Protege expands across gateway, chat, and scheduler flows, context composition must be:

1. explicit
2. deterministic
3. persona-scoped
4. file-first for developer/operator clarity

The project also needs a first-class persona instruction document so that persona behavior does not depend on hidden state or ad-hoc prompts.

## Decision

Adopt a layered context contract with explicit source precedence:

1. `config/system-prompt.md` (global base behavior)
2. `personas/{persona_id}/PERSONA.md` (persona-specific identity/instructions)
3. `memory/{persona_id}/active.md` (short-horizon active memory)
4. invocation metadata note:
   - email/chat routing metadata for inbound context
   - responsibility metadata for scheduler runs
5. same-thread history (trimmed by budget)
6. current inbound/synthetic input text

Additional rules:

1. Context assembly is shared across email, chat, and scheduler entry paths.
2. Scheduler runs continue using run-scoped synthetic threads (ADR-0017), but now use the same layer pipeline.
3. Missing `PERSONA.md` does not fail runs in v1; it resolves to empty content with structured logging.
4. `relationships/` files are reserved for future context layers and are not loaded in this ADR.

## Consequences

Positive:

1. Persona behavior becomes explicit and editable from one canonical file.
2. Context behavior is predictable across all invocation sources.
3. Debugging improves through layer-aware context observability.
4. File-first ergonomics stay aligned with responsibilities and existing config conventions.

Tradeoffs:

1. Slightly more context-builder complexity.
2. Requires additional tests to ensure layer order and source-specific behavior stay stable.
3. Future context extensions (`relationships/`, retrieval layers) need explicit budgeting to avoid prompt bloat.

## Alternatives Considered

1. Keep current ad-hoc assembly and add persona text inline in system prompt:
   - rejected because it hides persona ownership and scales poorly with multi-persona workflows.
2. Store persona prompt only in DB:
   - rejected due to weaker file-first developer experience and poorer versionability.
3. Source-specific context builders per subsystem:
   - rejected because it creates drift between gateway/chat/scheduler behavior.
