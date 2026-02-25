# ADR 0018: Scheduler Runtime Is Gateway-Owned; Scheduler Does Not Own Network Connections

- Date: 2026-02-25
- Status: Accepted
- Technical Story: Eliminate transport ownership ambiguity and session thrash by keeping network boundaries in gateway runtime only

## Context

Scheduler is a global orchestrator. Responsibilities are persona-owned tasks resolved from persona file paths. Scheduler requires harness/tool execution, but it is not a network boundary.

A standalone scheduler process that opens relay websocket sessions introduces architecture drift:

1. duplicate network ownership between gateway and scheduler
2. session contention when both authenticate as the same persona
3. more reconnect/auth complexity and operational fragility

Protege already treats gateway as the network boundary for SMTP/relay ingress and egress. Scheduler should remain transport-agnostic.

## Decision

1. Gateway runtime owns network connections (SMTP transport and relay clients).
2. Scheduler runtime is hosted inside gateway runtime (same process lifecycle).
3. Scheduler must never establish relay websocket connections directly.
4. Scheduler scans and executes due responsibilities across all personas, deriving `personaId` from indexed responsibility ownership.
5. Scheduler executes responsibilities by creating synthetic inbound messages and invoking harness/tool loop using gateway-owned runtime action invokers.
6. `protege scheduler ...` is control-plane only in v1:
   - `sync` (and future non-runtime inspection commands)
   - no long-running networked scheduler process

## Consequences

Positive:

1. single, explicit network boundary in runtime architecture
2. no gateway/scheduler relay session collision
3. simpler observability and lifecycle management for operators
4. clearer separation of concerns (gateway = transport, scheduler = orchestration)
5. one scheduler loop can manage all persona responsibilities deterministically

Tradeoffs:

1. scheduler execution now depends on gateway process uptime
2. scheduler runtime controls move under gateway command surface

## Alternatives Considered

1. Keep standalone scheduler runtime with relay session roles:
   - workable, but still duplicates network ownership and process complexity.
2. Keep standalone scheduler runtime and require local SMTP transport only:
   - avoids relay collision, still violates single network boundary principle.
3. External scheduler service:
   - heavier infrastructure and not aligned with v1 local-first architecture.
