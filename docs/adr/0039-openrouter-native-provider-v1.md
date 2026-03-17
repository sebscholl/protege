# ADR-0039: OpenRouter Ships as a Native Built-In Provider

- Status: Accepted
- Date: 2026-03-17
- Deciders: Protege team
- Technical Story: Add OpenRouter as a first-class provider without creating a special-case integration path.

## Context

Protege already ships built-in native providers behind one normalized adapter contract. OpenRouter is valuable because it expands model reach while preserving the existing chat-completions style transport used by the harness.

Adding OpenRouter as an ad-hoc compatibility layer would fragment provider registration, setup UX, config defaults, and extension scaffolding.

## Decision

1. Ship `openrouter` as a native built-in provider id in the normalized provider contract.
2. Implement the adapter under `framework/extensions/providers/openrouter/` like the other built-in providers.
3. Keep OpenRouter on the same provider contract and parity expectations:
   - `generate()`
   - `generateWithTools()`
   - `generateStructured()` remains explicit and unsupported until implemented
4. Treat OpenRouter as OpenAI-compatible transport at the adapter boundary:
   - default base URL: `https://openrouter.ai/api/v1`
   - default env var: `OPENROUTER_API_KEY`
5. Include OpenRouter in shipped extension manifests, workspace scaffolding, and setup-provider selection.

## Consequences

Positive:

1. Users gain native framework support for OpenRouter without custom extension work.
2. Runtime, setup, and scaffolding stay consistent with the existing built-in provider model.
3. Future OpenRouter-specific behavior remains isolated to one adapter module.

Tradeoffs:

1. Built-in provider support surface expands and needs ongoing parity testing.
2. OpenRouter-specific extensions beyond the normalized contract are intentionally not exposed in v1.

## Alternatives Considered

1. User-supplied custom provider extension only:
   - rejected because OpenRouter is common enough to merit first-class support.
2. Alias OpenRouter to `openai` with base URL override only:
   - rejected because it hides the provider identity in config, docs, and model ids.
3. Separate compatibility path outside the provider registry:
   - rejected because it would violate the normalized extension architecture.
