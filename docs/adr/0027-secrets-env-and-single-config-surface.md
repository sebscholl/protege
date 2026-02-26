# ADR-0027: Secrets Live in `.env`; Remove Multi-Config Variants and Local Config Sprawl

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Reduce first-run confusion by separating sensitive credentials from stable configuration.

## Context

Current setup is confusing for first-time users due to multiple config variants (`*.local*`, examples, and mixed secret placement). Credentials appear in JSON config in some paths and env files in others.

## Decision

1. Sensitive credentials are stored only in environment variables (`.env` / `.env.local`).
2. JSON config files store only non-secret behavior and routing settings.
3. Provider configs use env variable references (for example `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`) rather than raw key literals.
4. Remove `*.local.json` runtime dependency patterns from onboarding guidance and defaults.
5. Keep one canonical config surface per subsystem (gateway, inference, system, extensions manifest).

## Consequences

Positive:

1. Clear mental model: config behavior in JSON, secrets in env.
2. Lower onboarding confusion and fewer stale configuration collisions.
3. Better compatibility with deployment and secret management workflows.

Tradeoffs:

1. Requires migration for users currently storing secret values in JSON.
2. Startup error messaging must be explicit when required env vars are missing.

## Alternatives Considered

1. Keep mixed secret placement:
   - rejected for UX and maintainability cost.
2. Keep separate local override config files:
   - rejected due to configuration drift and ambiguity.
