# Custom Hooks

Custom hooks let you react to any runtime event — send alerts, update external systems, track metrics, etc.

## Example: Slack Notification on Failures

```
extensions/hooks/slack-alert/
├── index.ts
├── config.json
└── README.md
```

**`index.ts`:**

```ts
import type {
  HarnessHookOnEvent,
  HarnessHookResult,
} from 'protege-toolkit';

export const onEvent: HarnessHookOnEvent = async (
  event,
  payload,
  config,
): Promise<HarnessHookResult> => {
  // Only act on tool failures and scheduler failures
  if (event !== 'harness.tool.call.failed' && event !== 'scheduler.run.failed') {
    return;
  }

  const webhookUrl = String(config.webhook_url ?? '');
  if (webhookUrl.length === 0) {
    return;
  }

  const toolName = String(payload.toolName ?? payload.responsibilityId ?? 'unknown');
  const errorMessage = String(payload.message ?? payload.errorMessage ?? 'unknown error');

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `[Protege] Failure in ${toolName}: ${errorMessage}`,
    }),
  });
};
```

**`config.json`:**

```json
{
  "webhook_url": ""
}
```

**Manifest registration:**

```json
{
  "hooks": [
    {
      "name": "slack-alert",
      "events": ["harness.tool.call.failed", "scheduler.run.failed"],
      "config": {
        "webhook_url": "https://hooks.slack.com/services/T.../B.../xxx"
      }
    }
  ]
}
```

## Chained Events

A hook can emit new events, triggering other hooks downstream. This is how the memory chain works — `thread-memory-updater` emits `memory.thread.updated`, which triggers `active-memory-updater`.

Return emitted events from your hook:

```ts
export const onEvent: HarnessHookOnEvent = async (event, payload, config) => {
  // ... your logic ...

  return {
    emit: [
      {
        event: 'memory.thread.updated',
        payload: {
          level: 'info',
          scope: 'hooks',
          event: 'memory.thread.updated',
          timestamp: new Date().toISOString(),
          personaId: String(payload.personaId ?? ''),
        },
      },
    ],
  };
};
```

## The Hook Contract

```ts
type HarnessHookOnEvent = <TEvent extends HookEventName>(
  event: TEvent,
  payload: HookEventPayloadByName[TEvent],
  config: Record<string, unknown>,
) => Promise<HarnessHookResult> | HarnessHookResult;

type HarnessHookResult = void | {
  emit?: Array<{
    event: HookEventName;
    payload: HookEventPayloadByName[HookEventName];
  }>;
};
```
