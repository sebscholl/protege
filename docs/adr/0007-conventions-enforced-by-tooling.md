# ADR-0007: Conventions Are Enforced by Project Tooling and PR Gates

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Prevent conventions drift and reduce review ambiguity

## Context

Protege now has strict conventions for tests, imports, JSDoc, path aliases, and documentation. If these remain purely aspirational, consistency will degrade quickly as implementation accelerates.

## Decision

1. Establish baseline repository tooling from day one:
   - TypeScript
   - Vitest
   - ESLint
2. Enforce path alias consistency across `tsconfig` and Vitest config.
3. Treat conventions checklist in `docs/conventions/enforcement.md` as PR gate criteria.
4. Keep network testing standardized via `tests/network/` fixture + helper architecture.

## Consequences

1. Faster and less subjective code review.
2. Lower risk of style and test-pattern fragmentation.
3. Some conventions remain partially manual until additional lint rules are introduced.

## Alternatives Considered

1. Manual-only enforcement: low setup cost, high long-term drift risk.
2. Delayed tooling setup: short-term speed, expensive retrofits later.
3. Over-automate all rules immediately: high upfront complexity before core features.
