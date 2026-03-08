# Hooks

Extension Surface: Yes

Hook extensions subscribe to lifecycle events emitted by core runtime systems.

Hooks are async observers for adjacent automation, not lifecycle controllers.

Contract (v1):

1. Hook code lives in `extensions/hooks/{hook-name}/`.
2. Each hook exports from `index.ts` or `index.js`.
3. Hook execution is non-blocking and failure-isolated.
4. Hook ordering is deterministic by `extensions/extensions.json` hook manifest order.
5. Hook callback signature is `onEvent(event, payload, config)`.
6. Event and payload types are exported from `@protege-pack/toolkit`.
7. Hooks may return `{ emit: [...] }` to trigger additional typed hook events.

Entry point resolution order is `index.js` first, then `index.ts`.

Distribution guidance:

1. Local/private development: TypeScript entrypoints are fine.
2. Shared/distributed extensions: prefer shipping `index.js` for runtime portability.

Manifest entries:

1. String form:
   - `"hook-name"`
2. Object form:
   - `{ "name": "hook-name", "events": ["*"], "config": {} }`

Guidance:

1. Keep hooks idempotent where possible.
2. Avoid side effects that mutate core flow unpredictably.
3. Prefer external notification, auditing, and telemetry behaviors.

Typed signature example (TypeScript):

```ts
import type { HarnessHookOnEvent } from '@protege-pack/toolkit';

export const onEvent: HarnessHookOnEvent = async (event, payload, config) => {
  if (event === 'harness.inference.completed') {
    // payload is typed for this event key
  }
};
```

## Hook Development Workflow

1. Create directory:
   - `extensions/hooks/{hook-name}/`
2. Add files:
   - `index.ts` (required)
   - `README.md` (required)
   - `config.json` (optional defaults)
3. Export callback from `index.ts`:
   - `onEvent(event, payload, config)`
4. Keep behavior side-effect-only and idempotent where possible.
5. Register hook in `extensions/extensions.json`:
   - string form: `"hook-name"`
   - object form: `{ "name": "hook-name", "events": ["*"], "config": { ... } }`
6. Add tests:
   - hook tests under `tests/extensions/hooks/{hook-name}/index.test.ts`
   - registry/dispatch tests under `tests/engine/harness/`
7. Validate:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`

## Event Names and Payload Types

Hook event names and payload types are defined in:

1. `engine/harness/hooks/events.ts`

Reference catalog:

1. `extensions/hooks/EVENTS.md`
