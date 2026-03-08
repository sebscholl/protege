# Protege Conventions

This directory defines mandatory engineering conventions for Protege.

These rules are normative:

- `MUST`: required.
- `SHOULD`: strongly recommended; exceptions must be justified in PR notes.

## Documents

1. `testing.md`: test philosophy, Vitest patterns, file layout, readability rules.
2. `code-style.md`: imports, signatures, type strategy, module structure, naming.
3. `documentation.md`: JSDoc requirements, folder README requirements, ADR linkage.
4. `network-testing.md`: MSW fixture architecture and interceptor helper contract.
5. `enforcement.md`: PR checklist and tooling expectations.

## Scope

These conventions apply to:

1. `engine/`
2. `memory/`
3. `extensions/`
4. `configs/` templates and schema code
5. `tests/`
6. CLI/TUI code

Boundary note:

1. Extension code under `extensions/**` uses `@protege-pack/toolkit` as its framework import surface.
2. Core/runtime code uses internal aliases (`@engine/*`, `@extensions/*`, etc.).

## Change Policy

1. Conventions can evolve.
2. Any material change should be captured in a new ADR or PR section named `Conventions Change`.
3. Existing code should be migrated incrementally unless a change is marked as immediate.
