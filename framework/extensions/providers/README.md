# Providers

Extension Surface: Yes

This directory contains provider adapter implementations for harness inference.

Each provider adapter maps the normalized contract from `engine/harness/providers/contract.ts` to provider-specific HTTP APIs and back.

Current built-in adapters:

1. `openai/`
2. `anthropic/`
3. `gemini/`
4. `grok/`
5. `openrouter/`

Provider directory contract:

1. `index.ts`: provider adapter implementation entrypoint.
2. `config.json`: provider default runtime config merged with manifest overrides.

Contract boundary:

1. Adapters must implement the normalized provider interface.
2. Harness runtime and orchestration remain provider-agnostic.
