# Build a Custom Tool

This page documents the complete tool authoring flow.

## Directory Layout

Create one folder under `extensions/tools/`:

```text
extensions/tools/ping-service/
  index.ts
  config.json
  README.md
```

## `index.ts` Contract

```ts
import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from '@engine/harness/tools/contract';

type PingInput = {
  target: string;
};

export const tool: HarnessToolDefinition = {
  name: 'ping_service',
  description: 'Pings one target through a runtime action.',
  inputSchema: {
    type: 'object',
    required: ['target'],
    additionalProperties: false,
    properties: {
      target: { type: 'string' },
    },
  },
  execute: async (
    args: {
      input: Record<string, unknown>;
      context: HarnessToolExecutionContext;
    },
  ): Promise<Record<string, unknown>> => {
    const input = parsePingInput({ input: args.input });

    return args.context.runtime.invoke({
      action: 'service.ping',
      payload: {
        target: input.target,
      },
    });
  },
};

function parsePingInput(
  args: {
    input: Record<string, unknown>;
  },
): PingInput {
  const target = args.input.target;
  if (typeof target !== 'string' || target.trim().length === 0) {
    throw new Error('ping_service input.target is required.');
  }

  return {
    target,
  };
}
```

## `config.json`

Keep extension-local defaults here. They are merged with manifest overrides.

```json
{
  "timeoutMs": 3000,
  "defaultTarget": "localhost"
}
```

## Register in Manifest

```json
{
  "tools": [
    {
      "name": "ping-service",
      "config": {
        "timeoutMs": 1000
      }
    }
  ]
}
```

## Runtime Behavior

1. harness loads enabled tool entries from `extensions/extensions.json`,
2. validates exported `tool` contract,
3. exposes tool to provider adapter during inference,
4. executes tool through the uniform runtime action interface.

## Failure Semantics

Tool failures are fed back into the run as structured tool-result failures (`ok: false`), allowing the model to adjust strategy in the same run loop when possible.

## Checklist

1. strict input validation in tool module,
2. deterministic output shape,
3. explicit runtime action usage,
4. README with behavior and examples,
5. tests for parse/execute/failure paths.
