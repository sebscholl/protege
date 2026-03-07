# Hook Events and Payloads

Source of truth:

1. `engine/harness/hooks/events.ts`
2. `extensions/hooks/EVENTS.md`

## Payload Base Shape

Every payload includes:

```ts
type HookEventPayloadBase<TEvent extends HookEventName> = {
  level: 'info' | 'error';
  scope: string;
  event: TEvent;
  timestamp: string;
} & Record<string, unknown>;
```

So each event has base fields plus event-specific keys from runtime log context.

## Full Event List (v1)

```txt
chat.runtime_action.completed
chat.send.failed
memory.active.updated
memory.thread.updated
gateway.alert.failed
gateway.alert.sent
gateway.alert.skipped_missing_admin_contact
gateway.alert.skipped_missing_persona
gateway.error
gateway.inbound.enqueued
gateway.inbound.parsed
gateway.inbound.received
gateway.inbound.server_started
gateway.outbound.queued_via_relay
gateway.outbound.sent_via_relay
gateway.outbound.relay_delivery_signal_timeout
gateway.outbound.sending
gateway.outbound.sent
gateway.persona.email_domain_reconciled
gateway.relay.authenticated
gateway.relay.client_starting
gateway.relay.clients_started
gateway.relay.control_message
gateway.relay.disconnected
gateway.relay.frame_invalid
gateway.relay.ingest_failed
gateway.relay.ingest_uninitialized
gateway.runtime_action.completed
gateway.runtime_action.invoking
gateway.scheduler.start_failed
harness.inbound.persisted
harness.inference.completed
harness.inference.started
harness.tool.call.completed
harness.tool.call.failed
harness.tool.call.started
harness.tool.calls.received
scheduler.alert.skipped_missing_admin_contact
scheduler.cron.enqueued
scheduler.cron.invalid_schedule
scheduler.cron.skipped_overlap
scheduler.cycle.persona_failed
scheduler.cycle.throttled
scheduler.recovery.interrupted_runs_finalized
scheduler.run.claimed
scheduler.run.completed
scheduler.run.failed
scheduler.run.started
scheduler.stopped
scheduler.sync.completed
```

## Common Event-Specific Keys

Frequently present keys include:

1. `personaId`
2. `threadId`
3. `messageId`
4. `correlationId`
5. `toolName`
6. `toolCallId`
7. `runId`
8. `responsibilityId`
9. `errorName`
10. `message`

For event-by-event key mapping, see `extensions/hooks/EVENTS.md`.

## Payload Examples

### `harness.tool.call.failed`

```json
{
  "level": "error",
  "scope": "gateway",
  "event": "harness.tool.call.failed",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "correlationId": "persona:thread:message",
  "toolName": "send_email",
  "toolCallId": "call_123",
  "message": "No recipients defined",
  "errorName": "Error",
  "errorStackPreview": [
    "Error: No recipients defined"
  ]
}
```

### `scheduler.run.failed`

```json
{
  "level": "error",
  "scope": "scheduler",
  "event": "scheduler.run.failed",
  "timestamp": "2026-03-01T12:05:00.000Z",
  "personaId": "68c33af4249a5647",
  "runId": "1400772a-a147-44c6-81c5-677b07402f8e",
  "responsibilityId": "joke-email",
  "threadId": "responsibility.6dcdbfbc-8780-4b1a-a2fa-7c074ec81b8d",
  "messageId": "<responsibility.abc@localhost>",
  "failureCategory": "runtime_action_failure",
  "errorMessage": "Runtime action is not configured: email.send"
}
```

## Type-Safe Hook Example

```ts
import type { HarnessHookOnEvent } from '@engine/harness/hooks/events';

export const onEvent: HarnessHookOnEvent = async (event, payload, config) => {
  void config;

  if (event === 'harness.tool.call.failed') {
    const toolName = String(payload.toolName ?? 'unknown');
    const errorMessage = String(payload.message ?? 'unknown');
    process.stdout.write(`tool_failed ${toolName}: ${errorMessage}\n`);
  }

  if (event === 'scheduler.run.failed') {
    const runId = String(payload.runId ?? 'unknown');
    const category = String(payload.failureCategory ?? 'unknown');
    process.stdout.write(`scheduler_failed ${runId}: ${category}\n`);
  }
};
```
