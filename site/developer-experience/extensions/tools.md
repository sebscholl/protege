# Tools

Tools expose callable capabilities to the model via the harness tool loop.

## Tool Contract

```ts
export type HarnessToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  }) => Promise<Record<string, unknown>>;
};

export type HarnessToolExecutionContext = {
  runtime: {
    invoke: (args: {
      action: string;
      payload: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
  };
  logger?: {
    info: (args: { event: string; context: Record<string, unknown> }) => void;
    error: (args: { event: string; context: Record<string, unknown> }) => void;
  };
};
```

## Built-In Tools

### `shell`

- Why: execute deterministic local command actions.
- Runtime action: `shell.exec`.
- Input: `command`, optional `timeoutMs`, `workdir`, `maxOutputChars`.

### `glob`

- Why: discover candidate files quickly.
- Runtime action: `file.glob`.
- Input: `pattern`, optional `cwd`, `maxResults`.

### `search`

- Why: content search for targeted reads.
- Runtime action: `file.search`.
- Input: `query`, optional `path`, `isRegex`, `maxResults`.

### `read_file`

- Why: load file content into current run context.
- Runtime action: `file.read`.
- Input: `path`.

### `write_file`

- Why: create/replace UTF-8 files.
- Runtime action: `file.write`.
- Input: `path`, `content`.

### `edit_file`

- Why: literal patch without full overwrite.
- Runtime action: `file.edit`.
- Input: `path`, `oldText`, `newText`, optional `replaceAll`.

### `web_fetch`

- Why: HTTP(S) page fetch without provider-specific search APIs.
- Runtime action: `web.fetch`.
- Input: `url`, optional `maxBytes`, `timeoutMs`.

### `web_search`

- Why: provider-backed web retrieval via a normalized tool interface.
- Runtime action: `web.search`.
- Input: `query`, optional `maxResults`.
- Config supports provider selection and API key env indirection.

### `send_email`

- Why: explicit outbound communication path from model.
- Runtime action: `email.send`.
- Required input: `to`, `subject`, `text`.
- Optional input includes `cc`, `bcc`, `html`, headers, threading mode, attachments.

## Runtime Action Surface Used by Tools

Current gateway runtime actions:

- `file.read`
- `file.write`
- `file.edit`
- `file.glob`
- `file.search`
- `web.fetch`
- `web.search`
- `shell.exec`
- `email.send`

## Build a Custom Tool

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
  description: 'Ping one service endpoint through a runtime action.',
  inputSchema: {
    type: 'object',
    required: ['target'],
    additionalProperties: false,
    properties: {
      target: { type: 'string' },
    },
  },
  execute: async (args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  }): Promise<Record<string, unknown>> => {
    const input = normalizeInput({ input: args.input });
    return args.context.runtime.invoke({
      action: 'service.ping',
      payload: input,
    });
  },
};

function normalizeInput(args: { input: Record<string, unknown> }): PingInput {
  const target = args.input.target;
  if (typeof target !== 'string' || target.trim().length === 0) {
    throw new Error('ping_service input.target is required.');
  }
  return { target };
}
```

Then register in `extensions/extensions.json`:

```json
{
  "tools": [
    "ping-service"
  ]
}
```

Or with config override:

```json
{
  "tools": [
    {
      "name": "web-search",
      "config": {
        "provider": "tavily",
        "defaultMaxResults": 8
      }
    }
  ]
}
```

## Failure Behavior in Tool Loop

In harness loop execution, recoverable tool failures are sent back to the model as structured tool-result errors (`ok: false`) rather than immediately terminating the run. Non-recoverable categories still fail fast.
