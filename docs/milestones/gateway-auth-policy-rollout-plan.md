# Gateway Auth Policy Rollout Plan

Last Updated: 2026-03-09

## Objective

Ship gateway sender-auth policy with one behavior model across transport and relay ingress, while preserving out-of-box usability.

## Current State

Completed:

1. `configs/security.json` includes default `gateway_auth` block (`enabled=true`, `mode=monitor`).
2. Security config parser supports `gateway_auth`.
3. Shared auth evaluator supports:
   - signal parsing from `Authentication-Results`
   - monitor/enforce decisioning
   - allowlist bypass option
4. Inbound gateway path runs auth evaluation before persistence and can reject with `auth_failed`.
5. Gateway emits `gateway.auth.evaluated` event with signal details.

## Remaining Work

1. Relay attestation hardening:
   - add signed auth-result attestation in relay tunnel metadata
   - verify attestation at gateway before trust
2. Transport verification hardening:
   - optional local SPF/DKIM/DMARC verification path for direct SMTP mode
3. Add dedicated e2e matrix:
   - monitor vs enforce
   - access allowlist bypass vs no bypass
   - transport + relay parity
4. Expand operator docs:
   - policy tuning examples
   - migration path from monitor to enforce

## Test Matrix Targets

1. Unit:
   - auth header signal parsing variants
   - monitor/enforce decisions
   - allowlist bypass decisions
2. Integration:
   - inbound reject on enforce fail before persistence
   - inbound allow on monitor fail
3. E2E:
   - default scaffold behavior unchanged (monitor)
   - enforce blocks failed sender auth
