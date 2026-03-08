# Conventions Enforcement

## PR Checklist (Required)

1. Tests added/updated for all changed behavior.
2. New `it(...)` blocks are concise (one to two lines) and readable.
3. Tests do not mock internal modules/functions; network interactions use MSW + fixtures.
4. Import groups follow the required order and blank-line separation.
5. All new/changed classes, modules, methods, and functions have JSDoc.
6. Multi-argument signatures are line-broken.
7. Multi-parameter methods use typed object arguments where appropriate.
8. Unique argument shapes use inline types unless shared.
9. No deep relative imports between top-level domains; aliases used.
10. Extension modules (`extensions/**`) import framework APIs from `@protege-pack/toolkit` only (no `@engine/*`/internal aliases).
11. Required folder `README.md` files are added/updated.
12. Test file paths mirror source file paths under `tests/` (for example `engine/x.ts` -> `tests/engine/x.test.ts`).

## Tooling Expectations

1. `Vitest` is the source of truth for unit/integration tests.
2. `tsconfig` path aliases and Vitest aliases MUST stay in sync.
3. Linting/formatting SHOULD automate what can be automated.
4. Remaining non-automatable rules MUST be reviewed in PR checklist.

## Non-Blocking vs Blocking

1. Violations of mandatory (`MUST`) rules are blocking.
2. `SHOULD` deviations are allowed only with explicit rationale in PR notes.
