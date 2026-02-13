# ADR-0004: Extensions Run Trusted and In-Process in v1

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Prioritize extension simplicity and developer velocity in greenfield v1

## Context

Protege supports default and third-party extensions. We need a runtime model for loading tools/hooks with minimal friction. Sandbox isolation improves safety but adds major complexity and maintenance cost.

## Decision

1. Extensions are loaded in-process from `extensions/extensions.json`.
2. Extensions are treated as trusted code in v1.
3. No sandbox/process isolation in v1.
4. Core runtime provides clear extension lifecycle and failure logging.
5. Documentation must explicitly state trust expectations and risk of installing unknown extensions.

## Consequences

1. Very low barrier for extension development and distribution.
2. Lower runtime complexity and easier debugging.
3. Security risk is shifted to user trust decisions.
4. Future sandboxing will require a compatibility/migration strategy.

## Alternatives Considered

1. Subprocess isolation per extension: better containment, higher complexity and IPC overhead.
2. Permissioned capability sandbox in v1: improved safety, materially slower delivery and more API surface.
3. No third-party extensions in v1: safest path, conflicts with project extensibility goals.
