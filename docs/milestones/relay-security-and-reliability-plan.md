# Relay Security and Reliability Plan

Last Updated: 2026-03-07
Owner: Edgar
Status: Proposed (ready for implementation)

## Objective

Harden relay against abuse, resource exhaustion, and delivery ambiguity while preserving the current simplicity and keypair-auth model.

## Current state (observed in code)

1. SMTP ingress accepts unauthenticated mail and routes by recipient local-part.
2. Inbound SMTP body is fully buffered in memory before routing.
3. WS auth is challenge-response (good), but challenge storage is in-memory and not garbage-collected.
4. No ingress rate limiting by IP / subnet / identity.
5. No WS heartbeat/idle-timeout enforcement.
6. Outbound uses direct-to-MX with retry, but no durable spool.
7. Outbound delivery confirmation is frame/control-based and can time out at caller.
8. Operational controls are mostly log-based, with limited attack telemetry.

## Threat model summary

### Abuse and Availability

1. SMTP flood (connection or message volume) causing CPU/memory pressure.
2. Large MIME payloads exhausting memory due to full-buffer reads.
3. WS connection churn or idle zombie sockets.
4. Challenge flooding causing unbounded in-memory store growth.

### Identity/Auth

1. challenge replay window abuse.
2. brute-force auth attempts against one key identity.
3. key compromise remains unrecoverable in-place by design (rotation required).

### Delivery Integrity

1. duplicate outbound sends under uncertain delivery signaling.
2. no durable queue means restart can lose in-flight outbound deliveries.
3. partial observability makes postmortems expensive.

## Security hardening roadmap

## Phase R1 (highest priority): Abuse controls + memory safety

1. Add IP-based ingress rate limits:
   1. connection rate.
   2. messages per minute.
   3. auth attempts per minute.
2. Add hard payload limits:
   1. max SMTP message bytes.
   2. max recipients per message (relay currently uses single-recipient flow; enforce explicitly).
3. Replace full-buffer SMTP read with bounded streaming (or reject above threshold before buffering).
4. Add relay challenge GC:
   1. periodic purge of expired and used challenges.
   2. cap total challenge records in memory.
5. Add websocket idle timeout + heartbeat policy:
   1. server ping/pong watchdog.
   2. close dead sockets and remove registry entries.

## Phase R2: Reliability and idempotency

1. Add durable outbound spool in relay SQLite:
   1. queued
   2. sending
   3. sent
   4. failed_terminal
2. Include idempotency key in outbound stream metadata to avoid duplicate delivery after retries/timeouts.
3. Split "queued" from "sent" semantics clearly in gateway-relay control protocol.
4. Add startup recovery worker to resume queued outbound deliveries.

## Phase R3: Transport/auth robustness and auditability

1. Add signed/auditable auth attempt logging with source IP and reason codes.
2. Add per-key and per-IP temporary deny windows for repeated auth failures.
3. Add config toggles for strict outbound posture (TLS-required where available) with fail-open/fail-closed modes.
4. Add explicit operator surface for block/allow lists (IP level first).

## Protocol and observability improvements

1. Expand control messages with stable machine-readable codes:
   1. `delivery_queued`
   2. `delivery_sent`
   3. `delivery_failed_transient`
   4. `delivery_failed_terminal`
2. Standardize correlation IDs across ingress, ws frame stream, outbound attempts.
3. Add relay-specific `protege relay status` and `protege relay metrics` command targets later.

## Test strategy

Unit:

1. rate limiter correctness (burst, refill, deny windows).
2. challenge GC correctness.
3. max-size enforcement paths.
4. ws heartbeat timeout behavior.

Integration:

1. SMTP flood simulation => expected rejects without crash.
2. oversized payload => deterministic rejection code.
3. dropped ws connection => cleanup + reconnect path.
4. outbound retry + idempotency => no duplicate final delivery.

E2E:

1. gateway + relay + external mailbox success path.
2. transient DNS/MX failure recovery path.
3. process restart with queued outbound jobs.

## Operational runbook additions

1. security event dashboard from logs:
   1. auth failures by IP.
   2. rejected ingress reasons.
   3. queue depth.
   4. outbound failure rate by domain.
2. incident playbook:
   1. IP block escalation.
   2. relay safe-mode (ingress deny, outbound drain only).
   3. key-rotation guidance for compromised persona keys.

## Immediate implementation order (tomorrow onward)

1. R1.1 + R1.2 + R1.4 first (rate limits, limits, challenge GC).
2. R1.5 second (ws heartbeat/idle timeout).
3. R2.1 design spike and schema draft.

## Decision checkpoint for tomorrow

1. Confirm target max SMTP payload default.
2. Confirm rate-limit defaults (per IP and per key).
3. Confirm whether durable spool is mandatory for v1.0 release or v1.1.

## Research references

1. SMTP core requirements (RFC 5321): https://datatracker.ietf.org/doc/html/rfc5321
2. Message format limits and semantics (RFC 5322): https://datatracker.ietf.org/doc/html/rfc5322
3. SMTP STARTTLS extension (RFC 3207): https://datatracker.ietf.org/doc/html/rfc3207
4. DNS mail auth overview (SPF, DKIM, DMARC): https://www.cloudflare.com/learning/email-security/email-authentication/
5. Node.js process and signal handling: https://nodejs.org/api/process.html
