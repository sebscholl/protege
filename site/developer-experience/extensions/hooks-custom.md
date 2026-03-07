# Build a Custom Hook

## Directory Layout

```text
extensions/hooks/log-to-slack/
  index.ts
  config.json
  README.md
```

## Hook Implementation

```ts
import type {
  HarnessHookOnEvent,
  HarnessHookResult,
} from '@engine/harness/hooks/events';

export const onEvent: HarnessHookOnEvent = async (
  event,
  payload,
  config,
): Promise<HarnessHookResult> => {
  if (event !== 'harness.tool.call.failed') {
    return;
  }

  const webhookUrl = String(config.webhook_url ?? '');
  if (webhookUrl.length === 0) {
    return;
  }

  const body = {
    text: `[Protege] tool failure ${String(payload.toolName ?? 'unknown')}: ${String(payload.message ?? 'unknown')}`,
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};
```

## Hook Config

```json
{
  "webhook_url": "",
  "channel": "#ops"
}
```

## Manifest Registration

```json
{
  "hooks": [
    {
      "name": "log-to-slack",
      "events": [
        "harness.tool.call.failed",
        "scheduler.run.failed"
      ],
      "config": {
        "webhook_url": "${SLACK_WEBHOOK_URL}"
      }
    }
  ]
}
```

## Notes

1. hooks run async and are non-blocking,
2. hook errors are isolated,
3. use explicit `events` filters to limit load and noise.
