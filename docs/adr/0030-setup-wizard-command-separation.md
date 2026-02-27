# ADR-0030: Guided Onboarding Wizard Lives in `protege setup`; `protege init` Stays Scaffold-Only

- Status: Accepted
- Date: 2026-02-27
- Deciders: Protege team
- Technical Story: Preserve strict CLI separation of concerns while shipping guided onboarding.
- Supersedes In Part: ADR-0028 (`init` command placement only)

## Context

ADR-0028 placed guided onboarding inside `protege init`. During implementation and local package validation, this mixed two distinct responsibilities:

1. `init` as deterministic scaffold generation.
2. `wizard` as opinionated configuration orchestration.

This coupling makes automation less predictable and increases command surface complexity in one module.

## Decision

1. `protege init` remains scaffold-only and non-opinionated.
2. Guided onboarding is moved to a dedicated command: `protege setup`.
3. `setup` orchestrates scaffold + configuration in one flow while calling into focused modules.
4. `setup` is the recommended first-run path for humans.
5. `init` remains available for scripted/bootstrap-only use cases.

## Consequences

Positive:

1. Cleaner command semantics and implementation boundaries.
2. Better testability via isolated setup module behavior.
3. Better UX: users choose between raw scaffold (`init`) and guided onboarding (`setup`) explicitly.

Tradeoffs:

1. Two commands must be documented clearly to avoid confusion.
2. Some docs and prior ADR language require updates for consistency.

## Alternatives Considered

1. Keep wizard inside `init`:
   - rejected due to mixed concerns and automation ambiguity.
2. Remove `init` and keep only `setup`:
   - rejected because scaffold-only workflows are still useful for controlled automation.
