# Hook Events

Extension Surface: Yes

This file documents the v1 hook event catalog and payload contract.

Source of truth:

1. Event names and mapped payload types: `engine/harness/hooks/events.ts`

## Payload Contract

All hook callbacks receive:

1. `event`: `HookEventName`
2. `payload`: `HookEventPayloadByName[event]`
3. `config`: resolved hook config object

Hooks may also return a chained emission payload:

1. `{ emit: [{ event, payload }] }`

`payload` always includes base fields:

1. `level`: `'info' | 'error'`
2. `scope`: runtime scope (for example `gateway`, `chat`)
3. `event`: event name
4. `timestamp`: ISO-8601 timestamp

And may include event-specific context fields emitted by runtime log calls (for example `personaId`, `threadId`, `messageId`, `correlationId`, `toolName`, `runId`).

## Event Catalog (v1)

Authoritative event names are defined in `engine/harness/hooks/events.ts` (`HOOK_EVENT`).

Notable chain events:

1. `harness.inference.completed`
2. `memory.thread.updated`
3. `memory.active.updated`

## Payload Fields by Event (Additional to Base Fields)

Base fields are always present: `level`, `scope`, `event`, `timestamp`.

1. `chat.runtime_action.completed`: `action`, `threadId`, `messageId`
2. `chat.send.failed`: `personaId`, `threadId`, `errorName`, `message`, `errorStackPreview`
3. `memory.active.updated`: `personaId`, `threadId`, `synthesisProvider`, `synthesisModel`
4. `memory.thread.updated`: `personaId`, `threadId`, `sourceMessageId`, `sourceReceivedAt`, `sourceToolEventAt`, `synthesisProvider`, `synthesisModel`
5. `gateway.alert.failed`: `correlationId`, `personaId`, `threadId`, `messageId`, `message`
6. `gateway.alert.sent`: `correlationId`, `personaId`, `threadId`, `messageId`, `alertMessageId`
7. `gateway.alert.skipped_missing_admin_contact`: `correlationId`, `personaId`, `threadId`, `messageId`
6. `gateway.alert.skipped_missing_persona`: `correlationId`, `threadId`, `messageId`
7. `gateway.error`: union payload from callsite, typically one of:
   - `reasonCode`, `message`, `smtpSessionId`
   - `correlationId`, `attempt`, `message`
   - `correlationId`, `message`, `personaId`, `threadId`, `messageId`
8. `gateway.inbound.enqueued`: `correlationId`, `personaId`, `threadId`, `messageId`
9. `gateway.inbound.parsed`: `messageId`, `threadId`, `rawMimePath`, `attachmentCount`, `smtpSessionId`, `personaId`
10. `gateway.inbound.received`: `correlationId`, `personaId`, `threadId`, `messageId`
11. `gateway.inbound.server_started`: `host`, `port`, `dev`
12. `gateway.outbound.queued_via_relay`: `correlationId`, `attempt`, `recipients`, `inReplyTo`, `messageId`, `deliverySignalTimedOut?`
13. `gateway.outbound.sent_via_relay`: `correlationId`, `attempt`, `recipients`, `inReplyTo`, `messageId`
14. `gateway.outbound.relay_delivery_signal_timeout`: `correlationId`, `attempt`, `message`, `recipients`, `inReplyTo`, `messageId`
15. `gateway.outbound.sending`: `correlationId`, `attempt`, `to`, `inReplyTo`
16. `gateway.outbound.sent`: `correlationId`, `attempt`, `to`, `inReplyTo`
17. `gateway.persona.email_domain_reconciled`: `personaId`, `from`, `to`
18. `gateway.relay.authenticated`: `personaId`, `publicKeyBase32`
19. `gateway.relay.client_starting`: `personaId`, `publicKeyBase32`
20. `gateway.relay.clients_started`: `relayClientCount`
21. `gateway.relay.control_message`: `personaId`, `type`, `code`
22. `gateway.relay.disconnected`: `personaId`, `reconnectAttempt`, `reconnectDelayMs`
23. `gateway.relay.frame_invalid`: `personaId`, `bytes`
24. `gateway.relay.ingest_failed`: `message`, `recipientAddress`
25. `gateway.relay.ingest_uninitialized`: `recipientAddress`
26. `gateway.runtime_action.completed`: `correlationId`, `action`, `messageId`, optional email fields `to`, `subject`, `attachmentCount`, `attachmentNames`
27. `gateway.runtime_action.invoking`: `correlationId`, `action`, optional email fields `to`, `subject`, `attachmentCount`, `attachmentNames`
28. `gateway.scheduler.start_failed`: `message`
29. `harness.inbound.persisted`: `correlationId`, `personaId`, `threadId`, `messageId`
30. `harness.inference.completed`: `correlationId`, `personaId`, `threadId`, `messageId`, `responseMessageId`, `suppressedFinalPersistence`
31. `harness.inference.started`: `correlationId`, `personaId`, `threadId`, `messageId`
32. `harness.tool.call.completed`: `correlationId`, `toolName`, `toolCallId`
33. `harness.tool.call.failed`: `correlationId`, `toolName`, `toolCallId`, `message`, optional `errorName`, `errorStackPreview`
34. `harness.tool.call.started`: `correlationId`, `toolName`, `toolCallId`
35. `harness.tool.calls.received`: `correlationId`, `count`, optional `toolCalls`
36. `scheduler.alert.skipped_missing_admin_contact`: `personaId`, `runId`, `responsibilityId`
37. `scheduler.cron.enqueued`: `personaId`, `responsibilityId`, `triggeredAt`, `runId`
38. `scheduler.cron.invalid_schedule`: `personaId`, `responsibilityId`, `schedule`
39. `scheduler.cron.skipped_overlap`: `personaId`, `responsibilityId`, `triggeredAt`, `runId`
40. `scheduler.cycle.persona_failed`: `personaId`, `message`
41. `scheduler.cycle.throttled`: `inFlightCount`, `blockedByGlobalLimitCount`, `maxGlobalConcurrentRuns`
42. `scheduler.recovery.interrupted_runs_finalized`: `personaId`, `recoveredRunCount`
43. `scheduler.run.claimed`: `personaId`, `runId`, `responsibilityId`, `triggeredAt`
44. `scheduler.run.completed`: `personaId`, `runId`, `responsibilityId`, `threadId`, `messageId`, `responseMessageId`
45. `scheduler.run.failed`: `personaId`, `runId`, `responsibilityId`, `threadId`, `messageId`, `failureCategory`, `errorMessage`
46. `scheduler.run.started`: `personaId`, `runId`, `responsibilityId`, `threadId`, `messageId`
47. `scheduler.stopped`: `personaCount`
48. `scheduler.sync.completed`: `personaId`, `upsertedCount`, `disabledCount`

## TypeScript Usage

```ts
import type { HarnessHookOnEvent } from 'protege-toolkit';

export const onEvent: HarnessHookOnEvent = async (event, payload, config) => {
  if (event === 'harness.tool.call.failed') {
    const toolName = String(payload.toolName ?? '');
    const message = String(payload.message ?? '');
    void config;
    void toolName;
    void message;
  }
};
```
