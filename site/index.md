---
layout: home

hero:
  name: Protege
  text: Email-native AI agent framework
  tagline: Build AI agents you communicate with over email — like a colleague, not a chatbot.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Why Email?
      link: '#why-email'

features:
  - title: Email as the Interface
    details: Your agent sends and receives real email. No proprietary chat protocol. Works with Gmail, Outlook, Apple Mail, or any SMTP client.
  - title: Local-First Runtime
    details: Agent logic, memory, and data stay on your machine. You choose the LLM provider. Nothing is hosted unless you opt into the relay.
  - title: Extension-First Design
    details: Swap LLM providers, add tools, hook into events, and customize context assembly — all through a simple JSON manifest.
  - title: Scheduled Responsibilities
    details: Define recurring tasks in markdown with a cron schedule. Your agent executes them asynchronously and emails you the results.
---

## What is Protege?

Protege is a **framework** for building AI agents that communicate over email. It gives you the primitives — a gateway, an inference harness, a tool system, memory, scheduling, and an extension architecture — and you assemble them into whatever agent your use case requires.

It works out of the box: `protege init`, configure a provider, and you have a working agent in minutes. But the real value is what you build on top of it. Every layer is designed to be extended or replaced — write custom tools, swap LLM providers, hook into lifecycle events, inject your own context at inference time. Protege is the foundation; the agent you build is yours.

::: tip Protege is a framework, not a product
If you want something that just works out of the box without writing code or learning an extension system, check out [OpenClaw](https://openclaw.com) or [ChatGPT](https://chatgpt.com). Protege is built for developers and builders who want full control over their agent's behaviors, integrations, context loading, deployment, and more.
:::

```
You (Gmail/Outlook/etc.)
   │
   ▼
┌───────────────────────────────┐
│  Protege Gateway (local)      │
│  ┌─────────┐  ┌──────────────┐│
│  │ Harness │──│ LLM Provider ││
│  │ (tools, │  │ (OpenAI,     ││
│  │ context)│  │ Anthropic,   ││
│  └─────────┘  │ Gemini,      ││
│               │ Grok)        ││
│               └──────────────┘│
└───────────────────────────────┘
   │
   ▼
You receive a reply email
```

## Why Email? {#why-email}

Most agent providers lock you into a proprietary chat interface or require 3rd party owned communication channel (e.g. WhatsApp, Discord, Telegram, Slack) to communcate. Protege takes a different approach: email is already the world's most widely deployed asynchronous messaging protocol. By building on SMTP, Protege gets several things for free:

- **Universal compatibility** — your agent works with every email client that exists
- **Asynchronous by default** — no need to sit and watch your agent think. Send a message, close your laptop, get a reply later
- **Thread-aware history** — email threading gives agents conversational memory without building a second protocol
- **Agent-to-agent communication** — agents can email each other using the same open protocol

## How It Works

1. **You email your agent** at its address (e.g., `charlie@mail.protege.bot`)
2. **The gateway receives the message** via SMTP (directly or through the relay bridge)
3. **The harness assembles context** — your agent's persona, memory, conversation history, and the incoming message
4. **The LLM generates a response**, optionally calling tools (web search, file I/O, shell, sending emails)
5. **The agent replies by email** back to you, continuing the thread

## What Can You Build?

- A **customer support agent** that receives support emails, looks up account data, troubleshoots issues, and replies — without a human in the loop
- A **sales assistant** that qualifies inbound leads, answers product questions, and forwards hot prospects to your team
- A **research assistant** that searches the web and emails you summaries on a schedule
- A **billing & invoicing agent** that processes invoice requests, generates line items, and emails confirmations to customers
- A network of **collaborating agents** — e.g., a triage agent routes incoming mail to specialized agents for support, sales, and ops

## Next Steps

- [Get started in 5 minutes](/getting-started/) — install, configure, and send your first email
- [Learn the extension system](/developer-experience/) — customize tools, providers, hooks, and resolvers
- [Understand the architecture](/internal-architecture/) — see how the gateway, harness, and scheduler fit together
