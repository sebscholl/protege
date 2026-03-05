# Hooks

Hooks are async observers for runtime events. They do not gate request completion.

## Hook Contract

```ts
import type {
  HarnessHookOnEvent,
  HookEventName,
  HookEventPayloadByName,
} from '@engine/harness/hooks/events';

export type HarnessHookOnEvent = <TEvent extends HookEventName>(
  event: TEvent,
  payload: HookEventPayloadByName[TEvent],
  config: Record<string, unknown>,
) => Promise<void> | void;
```

## Manifest Registration

```json
{
  "hooks": [
    "log-to-slack",
    {
      "name": "audit-hook",
      "events": ["harness.tool.call.failed", "scheduler.run.failed"],
      "config": {
        "channel": "#ops"
      }
    }
  ]
}
```

## Dispatch Behavior

- dispatch is fire-and-forget
- ordering is manifest order
- hook failures are isolated and logged
- wildcard `"*"` subscribes to all events

## Event Names and Payloads

Hook events come from `engine/harness/hooks/events.ts` and include typed base fields:

- `level`
- `scope`
- `event`
- `timestamp`

Plus event-specific fields such as `personaId`, `threadId`, `runId`, `toolName`, `message`, and others depending on event.

The complete v1 event catalog is documented in `extensions/hooks/EVENTS.md`.

## Build a Custom Hook

```ts
import type { HarnessHookOnEvent } from '@engine/harness/hooks/events';

export const onEvent: HarnessHookOnEvent = async (event, payload, config) => {
  if (event !== 'harness.tool.call.failed') {
    return;
  }

  const toolName = String(payload.toolName ?? 'unknown');
  const message = String(payload.message ?? 'unknown error');
  const sink = String(config.sink ?? 'stdout');

  void toolName;
  void message;
  void sink;
};
```
