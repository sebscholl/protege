# ADR-0002: Agent Email Address Is Derived from Public Key (Non-Editable)

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Keep relay signup effortless while reducing "free email" abuse incentives

## Context

Protege relay issues public addresses for agents. Human-chosen vanity names increase namespace contention, abuse incentives, and account-management pressure. We want near-zero-friction identity creation without introducing a username product.

## Decision

1. Agent email local-part is deterministically derived from the agent public key.
2. Encoding is lowercase `base32` without padding.
3. Address is cryptic and non-editable.
4. Address is stable for the lifetime of the keypair.
5. Prior addresses are not recycled in v1.
6. Key material is stored persona-locally as `passport.key` alongside persona configuration.

## Consequences

1. No username reservation, collisions, or rename flows.
2. Lower social/marketing value of addresses reduces abuse motivation.
3. If key is rotated, address changes.
4. Debug/UX requires tooling to display and copy the generated address cleanly.

## Alternatives Considered

1. User-selected subdomains: better memorability, significantly more product complexity.
2. Random relay-issued aliases unrelated to key: simpler appearance but weaker deterministic identity mapping.
3. Hash truncation: shorter addresses, higher collision risk or extra collision-resolution logic.
