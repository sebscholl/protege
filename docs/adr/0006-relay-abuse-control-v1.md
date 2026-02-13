# ADR-0006: Relay Abuse Control in v1 Uses IP Rate Limiting Only

- Status: Accepted
- Date: 2026-02-13
- Deciders: Protege team
- Technical Story: Keep relay minimal while protecting availability

## Context

Because identities are keypair-based and cheap to regenerate, identity-level blocking has low abuse-prevention value in v1. We need a simple control that protects relay uptime without introducing account systems.

## Decision

1. v1 relay anti-abuse control is IP-level rate limiting.
2. Optional temporary IP blocking is allowed as an operational measure.
3. No proof-of-work and no identity/account-based abuse scoring in v1.
4. Key compromise/loss recovery remains identity rotation (new keypair + re-register).

## Consequences

1. Relay remains simple and fast to implement.
2. Abuse handling is operationally straightforward.
3. Determined distributed abuse remains a residual risk for v1.
4. Future versions may add stronger controls if abuse patterns require it.

## Alternatives Considered

1. Proof-of-work on registration: stronger anti-bot cost, added UX and implementation complexity.
2. Account-based abuse controls: more precision, conflicts with no-signup design.
3. Key-level blocking as primary control: weak deterrent due to trivial key rotation.
