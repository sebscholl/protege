# LOGI Model in Protege

LOGI in Protege is implemented as concrete module boundaries.

## Loop

The loop is `executeProviderToolLoop` in `engine/harness/runtime.ts`.

- sends normalized messages to adapter
- processes tool calls
- appends tool results back into provider message history
- enforces `max_tool_turns`
- records tool call/result events

## Orchestrator

Orchestration exists across gateway + harness + scheduler:

- gateway orchestrates inbound parse/persist/enqueue and runtime action invocation
- harness orchestrates context loading + provider + tools
- scheduler orchestrates responsibility sync/cron/run claiming

## Gateway

Gateway owns protocol edge and side effects:

- inbound SMTP server
- outbound SMTP send or relay send path
- runtime actions (`file.*`, `web.*`, `shell.exec`, `email.send`)

## Inference

Inference is provider-agnostic core logic:

- context pipeline assembly
- provider adapter call
- tool registry/dispatch
- response persistence

## Mapping Table

| LOGI | Protege Modules |
| --- | --- |
| Loop | `engine/harness/runtime.ts` tool/provider iteration |
| Orchestrator | `engine/gateway/index.ts`, `engine/scheduler/runtime.ts`, context pipeline |
| Gateway | `engine/gateway/*` |
| Inference | `engine/harness/*` + `extensions/providers/*` |

## Reference

Conceptual framing: [The era of agentic application frameworks](https://blog.sebastian.cloud/a/the-era-of-agentic-application-frameworks)
