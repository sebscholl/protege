# ADR-0001: Relay Uses Agent-Centric Ed25519 Identity and Signature Auth

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Relay-first onboarding with minimal central complexity

## Context

Protege needs a relay for users who cannot expose inbound SMTP port 25. The relay must stay simple and avoid user-account complexity. We also need authentication that does not depend on long-lived bearer tokens and does not require sign-up/sign-in.

## Decision

1. Relay identity unit is the `agent`, not the user.
2. Each Protege instance generates an `ed25519` keypair locally.
3. Registration proves private-key control by signing a relay challenge.
4. Ongoing websocket auth also uses challenge-response signatures.
5. Relay stores minimal identity data keyed by public key:
   - `public_key`
   - `email_local_part` (derived)
   - `created_at`
   - `last_seen_at`
   - `status` (`active`)
6. No sign-up/sign-in, no user profile model, no tenant/account abstraction.
7. If key is lost or compromised, identity is treated as burned; client generates a new keypair and re-registers.

## Consequences

1. Relay remains small and focused on transport.
2. Identity ownership is cryptographically verifiable without account systems.
3. There is no practical revoke/re-enable semantics for compromised keys in v1.
4. Recovery is operationally simple: rotate to a new keypair.

## Alternatives Considered

1. Bearer token model (`subdomain + token`): simpler initial flow, weaker secret lifecycle and replay posture.
2. Full user accounts and tenancy: stronger admin controls, too much product and ops complexity for v1.
3. mTLS client certs: strong auth, but heavy UX/setup cost for terminal-first users.
