# ADR-0028: Guided Setup Wizard for First-Run Onboarding

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Make first-time setup reliable for terminal-competent users without manual configuration scavenger hunts.
- Superseded In Part By: ADR-0030 (wizard command placement moved from `init` to `setup`)

## Context

Blank-project setup currently requires too many manual decisions across files and commands. This produces sticky failures (missing provider keys, relay defaults, web-search config mismatch, persona bootstrapping gaps).

## Decision (Original)

1. `protege init` runs a guided setup wizard by default.
2. Wizard flow includes:
   - inference provider selection
   - inference API key capture (written to `.env`)
   - outbound mode selection (relay recommended)
   - first persona creation
   - web-search provider selection (`none`, `perplexity`, `tavily`)
   - optional web-search API key capture (written to `.env`)
   - doctor check and summary output
   - display persona email identity
   - optional gateway start
3. Wizard writes stable config + manifest values and avoids secret values in JSON files.
4. Non-interactive/scaffold-only mode remains available as explicit flag.

## Current Interpretation

Command placement from this ADR was superseded by ADR-0030:

1. `protege setup` owns guided onboarding.
2. `protege init` is scaffold-only.
3. Remaining wizard scope and onboarding goals from this ADR are unchanged.

## Consequences

Positive:

1. First-run success probability improves materially.
2. User intent is captured up front with fewer hidden prerequisites.
3. Supports relay-first recommendation while preserving advanced paths.

Tradeoffs:

1. `init` command complexity increases.
2. Interactive UX must be tested across terminal environments.

## Alternatives Considered

1. Keep manual setup only:
   - rejected due to recurring onboarding friction.
2. Separate `setup` command instead of wizard in `init`:
   - rejected to avoid splitting first-run flow across commands.
