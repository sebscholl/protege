# Hook Events

Extension Surface: Yes

This file documents the v1 hook event catalog and payload contract.

Source of truth:

1. Event names and mapped payload types: `engine/harness/hook-events.ts`

## Payload Contract

All hook callbacks receive:

1. `event`: `HookEventName`
2. `payload`: `HookEventPayloadByName[event]`
3. `config`: resolved hook config object

`payload` always includes base fields:

1. `level`: `'info' | 'error'`
2. `scope`: runtime scope (for example `gateway`, `chat`)
3. `event`: event name
4. `timestamp`: ISO-8601 timestamp

And may include event-specific context fields emitted by runtime log calls (for example `personaId`, `threadId`, `messageId`, `correlationId`, `toolName`, `runId`).

## Event Catalog (v1)

1. `chat.runtime_action.completed`
2. `chat.send.failed`
3. `gateway.alert.failed`
4. `gateway.alert.sent`
5. `gateway.alert.skipped_missing_admin_contact`
6. `gateway.alert.skipped_missing_persona`
7. `gateway.error`
8. `gateway.inbound.enqueued`
9. `gateway.inbound.parsed`
10. `gateway.inbound.received`
11. `gateway.inbound.server_started`
12. `gateway.outbound.queued_via_relay`
13. `gateway.outbound.relay_delivery_signal_timeout`
14. `gateway.outbound.sending`
15. `gateway.outbound.sent`
16. `gateway.persona.email_domain_reconciled`
17. `gateway.relay.authenticated`
18. `gateway.relay.client_starting`
19. `gateway.relay.clients_started`
20. `gateway.relay.control_message`
21. `gateway.relay.disconnected`
22. `gateway.relay.frame_invalid`
23. `gateway.relay.ingest_failed`
24. `gateway.relay.ingest_uninitialized`
25. `gateway.runtime_action.completed`
26. `gateway.runtime_action.invoking`
27. `gateway.scheduler.start_failed`
28. `harness.inbound.persisted`
29. `harness.inference.completed`
30. `harness.inference.started`
31. `harness.tool.call.completed`
32. `harness.tool.call.failed`
33. `harness.tool.call.started`
34. `harness.tool.calls.received`
35. `scheduler.alert.skipped_missing_admin_contact`
36. `scheduler.cron.enqueued`
37. `scheduler.cron.invalid_schedule`
38. `scheduler.cron.skipped_overlap`
39. `scheduler.cycle.persona_failed`
40. `scheduler.cycle.throttled`
41. `scheduler.recovery.interrupted_runs_finalized`
42. `scheduler.run.claimed`
43. `scheduler.run.completed`
44. `scheduler.run.failed`
45. `scheduler.run.started`
46. `scheduler.stopped`
47. `scheduler.sync.completed`

## TypeScript Usage

```ts
import type { HarnessHookOnEvent } from '@engine/harness/hook-events';

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

