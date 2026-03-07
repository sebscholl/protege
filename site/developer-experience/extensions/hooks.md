# Hooks

Hooks are asynchronous observers. They do not block the main request lifecycle.

## Contract

Source of truth: `engine/harness/hooks/events.ts`

```ts
export type HarnessHookOnEvent = <
  TEvent extends HookEventName,
>(
  event: TEvent,
  payload: HookEventPayloadByName[TEvent],
  config: Record<string, unknown>,
) => Promise<HarnessHookResult> | HarnessHookResult;
```

Hooks may return chained emissions:

```ts
export type HarnessHookResult = void | {
  emit?: Array<{
    event: HookEventName;
    payload: HookEventPayloadByName[HookEventName];
  }>;
};
```

## Read Next

1. [Built-in hooks and configuration](/developer-experience/extensions/hooks-built-ins)
2. [Hook events and payload reference](/developer-experience/extensions/hooks-events)
3. [Build a custom hook](/developer-experience/extensions/hooks-custom)
