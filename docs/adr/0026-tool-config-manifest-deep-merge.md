# ADR-0026: Tool Configuration Lives in `extensions.json` with Deep-Merge Overrides

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Simplify tool configuration UX by using one manifest surface while preserving sensible defaults.

## Context

Tool configuration currently relies on per-tool config files, which increases setup friction and creates scattered configuration surfaces. We need a cleaner operator model that supports defaults and targeted overrides in one place.

## Decision

1. `extensions/extensions.json` supports two tool entry forms:
   - string: `"tool-name"`
   - object: `{ "name": "tool-name", "config": { ... } }`
2. Tool modules define `defaultConfig` in code.
3. Effective tool config is resolved by deep merge:
   - base: tool `defaultConfig`
   - override: manifest entry `config`
4. Merge semantics:
   - objects: recursive merge
   - scalars: override
   - arrays: replace
5. String manifest entries use defaults only.
6. Existing string-only manifests remain fully backward compatible.

## Consequences

Positive:

1. Single visible control surface for enabling and configuring tools.
2. Out-of-box behavior works without mandatory per-tool config files.
3. Per-tool overrides are explicit and local.

Tradeoffs:

1. Tool registry/contract complexity increases slightly.
2. Deep-merge semantics must be consistent and tested.

## Alternatives Considered

1. Keep per-tool config files only:
   - rejected for UX sprawl.
2. Keep manifest string-only:
   - rejected because it blocks lightweight per-tool customization.
3. Override-only config with no defaults:
   - rejected because it increases setup burden.
