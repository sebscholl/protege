# Protege

[![CI](https://github.com/sebscholl/protege/actions/workflows/ci.yml/badge.svg)](https://github.com/sebscholl/protege/actions/workflows/ci.yml)
[![Release](https://github.com/sebscholl/protege/actions/workflows/release.yml/badge.svg)](https://github.com/sebscholl/protege/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/protege-toolkit/alpha?color=cb3837&label=npm)](https://www.npmjs.com/package/protege-toolkit)
[![GitHub release](https://img.shields.io/github/v/release/sebscholl/protege?include_prereleases&label=release)](https://github.com/sebscholl/protege/releases/latest)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-protege.bot-blue)](https://docs.protege.bot)

**Email-native Agent Framework - focused on simplicity, interoperability, and self-sovereignty.**

Email is the ultimate open protocol for agent communication — decentralized, universal, asynchronous, and threaded natively. Protege embraces email as the primary interface so that any person or system with an email client can directly interact with your agent without installing anything, creating accounts, or adopting proprietary APIs.

## Why Protege

**Local-first runtime.** Agent logic, memory, and data stay on your machine. Nothing is sent to a third-party platform unless you choose to.

**Email-first interface.** Built on open SMTP protocols. Your agent gets its own email address and communicates through standard email threads — compatible with Gmail, Outlook, or any mail client.

**Relay-first onboarding.** Most residential networks block inbound port 25. An optional lightweight relay bridges that gap so you can get started in seconds without configuring DNS or opening firewall ports. Power users can run fully self-sovereign with direct SMTP.

**Provider-agnostic inference.** Bring your own LLM — OpenAI, Anthropic, Gemini, Grok, and OpenRouter are supported out of the box.

**Extensible by design.** Custom tools, hooks, resolvers, and providers plug in through a typed extension surface published as `protege-toolkit` on npm.

## Getting Started

```bash
# Install globally
npm install -g protege-toolkit@alpha

# Create a project directory
mkdir my-protege && cd my-protege

# Run guided setup (recommended)
protege setup

# Or scaffold only (advanced)
protege init
```

Bootstrap relay mode and start the gateway:

```bash
protege relay bootstrap --relay-ws-url wss://relay.example.com/ws
protege gateway start
```

Verify everything is running:

```bash
protege status --json
protege doctor
```

Full walkthrough: [Getting Started](https://docs.protege.bot/getting-started/)

## Architecture

```
┌────────────────────┐       ┌────────────────────┐      ┌──────────────────┐
│  Any Email Client  │─SMTP─▶  Relay (optional)   │─WS──▶  Local Bot Client │
│  Gmail, Outlook…   │       │  Public MX bridge  │◀─WS──│  Your hardware   │
└────────────────────┘       └────────────────────┘      └──────────────────┘
                                                          │ Gateway
                                                          │ Harness (LLM)
                                                          │ Scheduler
                                                          │ Memory
                                                          │ Extensions
```

All sensitive data and agent intelligence remains fully self-hosted. The relay is an optional convenience — Protege works without it if you can receive inbound SMTP directly.

## Core Commands

| Command | Description |
|---|---|
| `protege setup` | Interactive guided setup |
| `protege init` | Scaffold a project directory |
| `protege gateway start\|stop\|restart` | Manage the email gateway |
| `protege relay bootstrap` | Connect to a relay server |
| `protege persona create\|list\|info\|delete` | Manage agent personas |
| `protege chat` | Open the chat TUI |
| `protege scheduler sync` | Sync scheduled responsibilities |
| `protege status` | Show runtime status |
| `protege doctor` | Diagnose configuration issues |
| `protege logs` | Stream runtime logs |

Most commands render pretty output by default and switch to raw JSON with `--json`.

## Monorepo Structure

This repository contains three independent packages:

| Package | npm Name | Description |
|---|---|---|
| `framework/` | `protege-toolkit` | CLI framework — gateway, harness, scheduler, extensions |
| `relay/` | `protege-relay` | Optional relay server for SMTP-over-WebSocket tunneling |
| `site/` | `protege-site` | Documentation site at [docs.protege.bot](https://docs.protege.bot) |

Each package has its own `package.json`, scripts, dependencies, and tests. Run commands from the package directory you are working on:

```bash
cd framework && npm test
cd relay && npm run test
cd site && npm run docs:dev
```

## Documentation

- [docs.protege.bot](https://docs.protege.bot) — User documentation
- [Getting Started](https://docs.protege.bot/getting-started/) — Setup walkthrough
- [CLI Reference](https://docs.protege.bot/reference/cli) — Full command reference
- [Chat Reference](https://docs.protege.bot/reference/chat) — Chat TUI usage
- [Troubleshooting](https://docs.protege.bot/reference/troubleshooting) — Common issues and fixes
