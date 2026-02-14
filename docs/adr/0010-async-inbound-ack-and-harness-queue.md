# ADR 0010: Async Inbound Acknowledgement and Harness Queue

- Date: 2026-02-14
- Status: Accepted
- Technical Story: Prevent long-running SMTP transactions while supporting concurrent persona processing

## Context

Inference, tools, and downstream actions can take significantly longer than SMTP request/response expectations. Holding inbound SMTP connections open for model/tool execution risks sender timeouts and relay backpressure.

Protege needs predictable inbound behavior under concurrent load and clear observability across personas.

## Decision

Adopt a two-phase inbound execution model:

1. Phase A (synchronous to SMTP request):
   - Parse/normalize inbound message.
   - Resolve persona and persist gateway artifacts.
   - Persist inbound row to persona temporal memory.
   - Acknowledge/complete SMTP processing promptly.
2. Phase B (asynchronous after ack):
   - Enqueue harness processing task.
   - Build context, call provider, execute tool loop.
   - Persist outbound/inferred messages.
   - Send outbound email only if transport and flow require it.

Logging:

1. Emit unified structured events across gateway/harness phases.
2. Persist JSON logs to a global runtime log file.
3. Support optional pretty console formatting for operator readability.

## Consequences

Positive:

1. SMTP senders/relays are not blocked on model latency.
2. Multiple inbound messages can progress concurrently across personas.
3. Inbound durability is guaranteed before inference execution.
4. Operational tracing is improved through phase-specific events.

Tradeoffs:

1. Additional orchestration complexity (queue/enqueue semantics).
2. Delivery of model responses becomes eventually consistent rather than immediate in one transaction.

## Alternatives Considered

1. Fully synchronous inbound processing:
   - simpler flow, but poor reliability under model/tool latency.
2. External queue/broker dependency in v1:
   - robust but adds infrastructure complexity too early.
