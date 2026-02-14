# Documentation Conventions

## Folder README Requirements

Every important folder MUST include a dedicated `README.md`.

Examples include:

1. `extensions/`
2. `extensions/tools/`
3. `extensions/hooks/`
4. `engine/gateway/`
5. `engine/harness/`
6. `engine/scheduler/`
7. `personas/`

Each folder README MUST explain:

1. Purpose of the directory.
2. What belongs in it.
3. What does not belong in it.
4. Whether it is intended to be extended by users.
5. Any safety or compatibility constraints.

## Extendability Label

Each README SHOULD include one explicit label:

1. `Extension Surface: Yes` for intended extension points.
2. `Extension Surface: No` for core internals users should not modify.

## JSDoc Requirement Reference

Code-level JSDoc rules are mandatory and defined in `code-style.md`.

## ADRs

1. Architecture-level decisions MUST be recorded in `docs/adr/`.
2. Conventions changes SHOULD reference a new ADR when the impact is broad.
3. Do not silently drift conventions in code without documentation updates.
