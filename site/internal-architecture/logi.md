# LOGI Model

Protege's architecture follows the **LOGI** pattern — a way of organizing agentic systems into four clear responsibilities. Each letter maps to concrete modules in the codebase.

For the original conceptual framing, see [The era of agentic application frameworks](https://blog.sebastian.cloud/a/the-era-of-agentic-application-frameworks).

## The Four Layers

### Loop — Autonomous Work Generation

The loop is the component that generates work on a schedule or trigger, independent of external requests. It ticks on a timer and feeds tasks to the orchestrator, enabling the agent to initiate action autonomously rather than only responding when prompted by a user.

**Implementation:** The **Scheduler** (`engine/scheduler/`) — it syncs persona responsibilities, evaluates cron schedules, enqueues runs, and dispatches them for execution.

```
Cron tick → Responsibility matched → Run enqueued → Dispatched to Orchestrator
```

### Orchestrator — Decision Engine

The orchestrator is the decision-making engine. It receives tasks from both the Loop (scheduled responsibilities) and the Gateway (inbound emails), then manages the full reasoning cycle — calling the LLM, parsing responses, executing tool calls, handling retries, and persisting results.

**Implementation:** The **Harness** (`engine/harness/`) — it assembles context via the resolver pipeline, selects the provider, runs the tool loop (`executeProviderToolLoop`), and persists responses. This is where most system complexity resides.

```
Context assembly → LLM call → Tool calls? → Execute → Feed results → ... → Final response
```

The harness enforces a `max_tool_turns` limit (default: 8) to prevent runaway tool-call chains.

### Gateway — Protocol Edge

The gateway is the external interface that normalizes inputs from multiple channels into standardized events. It decouples the agent's capabilities from its surface area by handling protocol translation so the orchestrator remains channel-agnostic.

**Implementation:** The **Gateway** (`engine/gateway/`) — it owns:

- **Inbound SMTP** server (or relay WebSocket receiver)
- **Outbound SMTP** sender (or relay tunnel sender)
- **Runtime actions** — the concrete implementations behind tool calls (`file.read`, `shell.exec`, `email.send`, etc.)

Tools don't directly read files or send emails. Instead, they call `context.runtime.invoke({ action: 'file.read', ... })`, and the gateway handles the actual side effect.

### Inference — Provider-Agnostic Reasoning

The inference layer is the LLM provider — analogous to a database in traditional web applications. It provides the underlying intelligence capability while remaining abstractable so you can swap providers without rewriting core logic.

**Implementation:** **Provider adapters** (`extensions/providers/`) — each adapter translates Protege's normalized message format into the vendor-specific API shape (OpenAI, Anthropic, Gemini, Grok) and translates the response back.

## Module Mapping

| LOGI Layer | Role | Protege Module |
|-----------|------|----------------|
| **Loop** | Autonomous work generation | `engine/scheduler/` — cron evaluation, run dispatch |
| **Orchestrator** | Decision engine, tool loop | `engine/harness/` — context assembly, provider calls, tool execution |
| **Gateway** | Protocol edge, I/O | `engine/gateway/` — SMTP, relay, runtime actions |
| **Inference** | LLM provider | `extensions/providers/` — OpenAI, Anthropic, Gemini, Grok adapters |

## Why This Matters

The LOGI separation means you can:

- **Swap providers** without touching tool or gateway code
- **Add tools** without modifying the orchestrator's reasoning loop
- **Change transport** (relay vs direct SMTP) without affecting how your agent thinks
- **Add scheduled behaviors** without modifying how inbound messages are processed
- **Test components in isolation** — the harness doesn't know about SMTP, and the gateway doesn't know about LLM APIs
