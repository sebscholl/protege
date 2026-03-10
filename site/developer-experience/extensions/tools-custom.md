# Custom Tools

To add a capability Protege doesn't ship with, create a custom tool.

## Execution Flow

You implement `tool.execute(...)`. You do **not** implement `context.runtime.invoke(...)` — that's provided by the harness at runtime and routes actions to gateway/runtime handlers.

```text
LLM decides to call tool
        |
        v
Harness tool registry resolves tool by name
        |
        v
tool.execute({ input, context })
        |
        +--> (optional) context.runtime.invoke({ action, payload })
                |
                v
         Gateway/runtime action handler
         (file.read, file.write, email.send, web.fetch, shell.exec, ...)
                |
                v
         Action result (Record<string, unknown>)
                |
                v
tool.execute returns result to harness
        |
        v
Harness passes tool result back to LLM
```

## Example: GitHub Issue Creator

### 1. Create the directory

```
extensions/tools/github-issue/
├── index.ts
├── config.json
└── README.md
```

### 2. Implement the tool contract

Your `index.ts` must export a `tool` object matching the `HarnessToolDefinition` type.
This primary example calls GitHub directly and returns the final tool result object:

```ts
import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege-toolkit';

import { request } from 'node:https';

export const tool: HarnessToolDefinition = {
  name: 'create_github_issue',
  description: 'Create a new GitHub issue in the specified repository.',
  inputSchema: {
    type: 'object',
    required: ['repo', 'title', 'body'],
    additionalProperties: false,
    properties: {
      repo: { type: 'string', description: 'Repository in owner/name format' },
      title: { type: 'string', description: 'Issue title' },
      body: { type: 'string', description: 'Issue body in markdown' },
      labels: { type: 'array', items: { type: 'string' } },
    },
  },
  execute: async (args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  }): Promise<Record<string, unknown>> => {
    const repo = String(args.input.repo);
    const title = String(args.input.title);
    const body = String(args.input.body);
    const labels = Array(args.input.labels)

    // Secrets get added to process.env[ENV_VAR_NAME]
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubToken || githubToken.trim().length === 0) {
      throw new Error('Missing GITHUB_TOKEN. Set it in .secrets or your shell env.');
    }

    args.context.logger?.info({
      event: 'tool.github_issue.create.started',
      context: {
        repo,
        title,
        labelCount: labels.length,
      },
    });

    const issue = await createGithubIssue({
      repo,
      title,
      body,
      labels,
      token: githubToken,
    });

    args.context.logger?.info({
      event: 'tool.github_issue.create.completed',
      context: {
        repo,
        issueId: issue.id,
      },
    });

    return {
      ok: true,
      repo,
      issueId: issue.id,
      url: issue.html_url,
    };
  },
};


/**
 * Creates one GitHub issue via REST API.
 */
async function createGithubIssue(
  args: {
    repo: string;
    title: string;
    body: string;
    labels: string[];
    token: string;
  },
): Promise<{
  id: number;
  html_url: string;
}> {
  /**
   * Call the github API...
   */
  return {
    id,
    html_url
  }
}
```

### 2.1 Optional: delegate to runtime actions with `context.runtime.invoke(...)`

Use `runtime.invoke(...)` when you want to reuse existing runtime capabilities (email/file/shell/web actions) instead of calling external APIs directly inside the tool.

```ts
const result = await args.context.runtime.invoke({
  action: 'file.write',
  payload: {
    path: '/tmp/issue-summary.txt',
    content: `Created issue ${issue.id}: ${issue.html_url}`,
  },
});
```

`runtime.invoke(...)` only works for actions your runtime/gateway actually implements.

### 3. Add default configuration

`config.json`:

```json
{
  "defaultLabels": ["agent-created"],
  "apiTokenEnv": "GITHUB_TOKEN"
}
```

### 4. Register in the manifest

```json
{
  "tools": [
    "send-email",
    {
      "name": "github-issue",
      "config": {
        "defaultLabels": ["agent-created", "needs-triage"]
      }
    }
  ]
}
```

## Key Points

- **Input validation** — always validate and type-narrow `args.input` before using it. The LLM may send unexpected shapes.
- **Secrets access** — read API keys from `process.env` (for example `process.env.GITHUB_TOKEN`). In Protege workflows these are typically loaded from `.secrets` / `.secrets.local` or exported in the shell environment.
- **Runtime actions** — use `args.context.runtime.invoke()` only for implemented runtime actions. For custom external APIs, call them directly inside your tool unless you also add a runtime action handler.
- **Tool logging** — tool-call start/completion is logged by harness automatically. Use `args.context.logger?.info/error(...)` only for tool-specific internal milestones you want surfaced.
- **Deterministic output** — return a consistent JSON shape so the LLM can reliably parse results.
- **Error handling** — if your tool throws, the error is wrapped as a structured `{ ok: false, error: ... }` result and fed back to the LLM. The model gets a chance to retry or adjust. Only certain errors (like "tool not found") are terminal.

## Tool Return Type

Every tool returns `Promise<Record<string, unknown>>`. This object is fed back to the model as tool result context.

Recommended pattern:

1. Return a stable object shape on success (for example `{ ok: true, issueId, url }`).
2. Include machine-readable fields the model can use in the next step.
3. Throw for hard failures (missing required auth, invalid input after validation, runtime-action failure) so the harness can pass structured error context back to the model.

## The Tool Contract

For reference, here's the full type interface:

```ts
type HarnessToolDefinition = {
  name: string;                              // snake_case name the LLM sees
  description: string;                       // Natural language description for the LLM
  inputSchema: Record<string, unknown>;      // JSON Schema for input validation
  execute: (args: {
    input: Record<string, unknown>;          // Parsed input from the LLM
    context: HarnessToolExecutionContext;     // Runtime action invoker + logger
  }) => Promise<Record<string, unknown>>;    // Result fed back to the LLM
};

type HarnessToolExecutionContext = {
  runtime: {
    invoke: (args: {
      action: string;                        // e.g., "email.send", "file.read"
      payload: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
  };
  logger?: GatewayLogger;
};
```
