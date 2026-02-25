# Harness

Extension Surface: No

Inference orchestration layer for context building, provider calls, and tool execution.

This is the core agent reasoning loop.

## Provider Contract

Provider adapters implement a normalized contract defined in:

1. `engine/harness/provider-contract.ts`
2. `engine/harness/providers/`
3. `engine/harness/runtime.ts`

Contract highlights:

1. Canonical model ids are `provider/model`.
2. Adapters expose explicit capability flags (`tools`, `structuredOutput`, `streaming`).
3. Unsupported features fail explicitly with typed provider errors.
4. Runtime pipeline persists inbound/outbound turns per persona memory namespace.
5. Inbound processing is split into:
   - synchronous persistence/ack phase
   - asynchronous inference/tool execution phase

## Tool Contract

Tool execution is defined by:

1. `engine/harness/tool-contract.ts`
2. `engine/harness/tool-registry.ts`
3. `extensions/tools/*`

The harness loads enabled tools from `extensions/extensions.json`, validates the exported contract, and executes tools by stable tool name.

Tools execute through a uniform runtime API:

1. `context.runtime.invoke({ action, payload })`
2. Core runtime maps actions (for example `email.send`, `file.read`, `file.search`, `shell.exec`) to concrete side effects.
