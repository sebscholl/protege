# Developer Experience

This section documents Protege as a framework API surface, not only as end-user commands.

## Source-Verified Extension Model

Protege runtime loads extension entries from `extensions/extensions.json`:

- `providers`
- `tools`
- `hooks`
- `resolvers`

Each extension type supports string and object entries.

Object entries support config override and deep-merge semantics in loaders.

## Runtime Boundaries

- Engine orchestration: `engine/`
- Extensions: `extensions/`
- Persona identity and prompts: `personas/`
- Runtime memory: `memory/{persona_id}/`
- User-editable config: `configs/`

## Key Principles

- explicit config over hidden defaults
- provider-agnostic inference contract
- tool/hook/resolver isolation by directory
- file-first operator ergonomics

## Explore

- [Extensions Overview](/developer-experience/extensions/)
- [Personas and Memory](/developer-experience/personas-memory)
- [.env and Secrets](/developer-experience/environment)
- [Config Files](/developer-experience/configuration)
