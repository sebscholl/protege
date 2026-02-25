# ADR-0019: Persona-Owned Sender Identity and No Active Persona

- Status: Accepted
- Date: 2026-02-25
- Deciders: Team
- Technical Story: Remove implicit global persona/sender abstractions that cause routing and deliverability ambiguity.

## Context

Protege had two implicit abstractions:

1. `active persona` pointer for CLI/runtime behavior.
2. `defaultFromAddress` as a global sender fallback.

Both conflict with the multi-persona model. Inbound routing is persona-addressed already, and outbound sender identity must be the same persona mailbox identity to preserve email authenticity and threading behavior.

## Decision

1. Remove active-persona pointer semantics from source and CLI workflow.
2. Remove global/default sender semantics (`defaultFromAddress`).
3. Make each persona declare its mailbox address explicitly in `personas/<persona_id>/persona.json` as `emailAddress`.
4. Use persona email identity as the canonical sender for harness, scheduler, chat, and gateway runtime actions.
5. Replace gateway sender config with `mailDomain` for relay/domain validation concerns.

## Consequences

1. Persona operations are explicit and deterministic; no hidden global selection state.
2. Outbound sender identity is always persona-scoped, reducing spoofing/drift and SPF/DKIM mismatch risk.
3. CLI/docs/test fixtures must use persona selectors and `mailDomain`, not active persona or default sender fields.
4. Existing installs using `defaultFromAddress` require config migration to `mailDomain`.

## Alternatives Considered

1. Keep active persona for convenience: rejected because it creates ambiguity in multi-persona runs.
2. Keep default sender fallback: rejected because sender identity must be persona-derived, not global.
