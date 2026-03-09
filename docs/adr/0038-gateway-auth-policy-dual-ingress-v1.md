# ADR-0038: Gateway Auth Policy Uses One Engine Across Transport and Relay Ingress

- Status: Accepted
- Date: 2026-03-09
- Deciders: Protege team
- Technical Story: Add sender-auth policy controls without splitting behavior between direct SMTP and relay mode.

## Context

Protege gateway has two inbound paths:

1. direct SMTP transport ingress
2. relay-tunneled ingress

Sender-auth policy must be consistent across both paths and remain configurable for safe rollout. A split implementation would drift and create unclear operator behavior.

## Decision

1. Introduce one gateway auth policy surface in `configs/security.json`:
   - `gateway_auth.enabled`
   - `gateway_auth.mode` (`monitor` | `enforce`)
   - `gateway_auth.policy` (`require_dmarc_or_aligned_spf_dkim`)
2. Parse sender-auth signals from inbound `Authentication-Results` when present:
   - `spf`
   - `dkim`
   - `dmarc`
3. Evaluate one shared policy decision with one shared evaluator:
   - monitor mode: always allow, emit explicit pass/fail reason
   - enforce mode: reject when policy fails
4. Keep gateway access policy and auth policy separate:
   - access policy still evaluates sender wildcard rules first
   - auth policy always evaluates independently of allowlist matches
5. Enable `gateway_auth` by default in monitor mode for out-of-box safe behavior.

## Consequences

Positive:

1. One policy engine serves both ingress paths.
2. Safe default rollout (monitor) preserves existing behavior while exposing auth telemetry.
3. Enforcement can be turned on per workspace without code changes.

Tradeoffs:

1. Current v1 signal source depends on `Authentication-Results` presence.
2. Transport-mode enforcement strength depends on upstream-auth availability unless local verification is added later.

## Alternatives Considered

1. Transport-only auth enforcement:
   - rejected because relay ingress would diverge.
2. Relay-only auth enforcement:
   - rejected because direct SMTP mode is a supported runtime mode.
3. Enforce by default:
   - rejected to avoid breaking first-run developer workflows before telemetry validation.
