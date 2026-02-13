# ADR-0005: Persona Is Selected Explicitly by Destination Address; TUI Must Target a Persona

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Multi-persona support without hidden routing state

## Context

Protege stores key material per persona and may have multiple personas locally. Inbound routing and TUI interactions must deterministically select the intended persona.

## Decision

1. Persona selection is explicit by destination address.
2. Canonical relay address format is:
   - `{persona_pubkey}@relay-protege-mail.com`
3. Inbound processing maps recipient local-part to persona public key.
4. TUI commands that initiate a conversation must specify target persona (or choose from an explicit list), never rely on implicit global active persona.
5. Thread records persist persona identity to prevent cross-persona history contamination.

## Consequences

1. Routing behavior is deterministic and auditable.
2. Multi-persona support is straightforward with no hidden defaults.
3. TUI UX needs a clear target-selection flow.
4. Data model must include persona key on thread/message linkage.

## Alternatives Considered

1. Single active persona in config: simpler UX, ambiguous in multi-persona workflows.
2. Per-thread inferred persona from latest context: fragile and error-prone.
3. Separate TUI per persona process: operationally heavier for users.
