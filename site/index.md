# Protege

Protege is an email-native AI agent framework. It treats email as the primary open protocol for agent interaction and promotes keeping runtime and intelligence local by default.

## Framework Positioning

Protege is not a single hosted product workflow. It is a local framework with explicit extension boundaries for:

- tools
- providers
- hooks
- resolvers
- and more...

Core behavior lives in `engine/`, while extension behavior is loaded from `extensions/extensions.json`.

Unlike other agentic tools, Protege aims to be "useful over engaging". What we mean by that is that most agentic tools glue the user to a terminal window or fancy UI, trying to keep them interested and engaged with for long working or messaging sessions. Protege was designed by a developer who wants to spend less time in front of the computer and phone screen, thus the ethos is around building agents you can asynchronously communicate with over email, like you would a colleague or friend.

## Why Email

Protege centers on SMTP-compatible message flow rather than a proprietary chat protocol. This gives:

- protocol interoperability with standard email clients and servers
- asynchronous delivery semantics that fit long-running inference and tool loops
- thread-aware history without introducing a second conversation protocol

## LOGI Architecture

Protege is organized around LOGI:

- **Loop**: bounded model/tool iteration in the harness (`engine/harness/runtime.ts`)
- **Orchestrator**: runtime flow coordination (gateway ingress, scheduler dispatch, context assembly)
- **Gateway**: SMTP ingress/egress and runtime action surface (`engine/gateway/`)
- **Inference**: provider-agnostic prompt/tool execution (`engine/harness/`)

Reference essay: [The era of agentic application frameworks](https://blog.sebastian.cloud/a/the-era-of-agentic-application-frameworks)

## Current Runtime Model

- Inbound gateway flow persists and acknowledges quickly, then enqueues async harness work.
- Scheduler runs are synthetic inbound messages and share the same harness path as email/chat turns.
- Chat is a terminal inbox client over the same thread/message store, not a separate protocol.
- Relay is optional. It exists for users who cannot receive inbound SMTP directly.

## Read Next

- [Getting Started](/getting-started/)
- [Developer Experience](/developer-experience/)
- [Internal Architecture](/internal-architecture/)
