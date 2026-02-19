# Protege

Email-native AI agent focused on simplicity, interoperability, and self-sovereignty.

## Why Protege

1. Email-first interface using open protocols.
2. Relay-first onboarding for users without inbound port 25.
3. Local-first runtime where agent logic and memory stay on your machine.

## Current State

1. Gateway, harness core loop, relay mode, and key operator commands are implemented.
2. CLI packaging for npm distribution is in progress and functional for local smoke usage.
3. Remaining major scope includes scheduler, more first-party tools, hooks, and full TUI chat.

See `docs/status.md` for milestone-level progress.

## Getting Started

1. Install:
```bash
npm install -g protege
```
2. Create and enter a project directory:
```bash
mkdir my-protege
cd my-protege
```
3. Scaffold project files:
```bash
protege init
```
4. Create a persona:
```bash
protege persona create --name "Primary" --set-active
```
5. Bootstrap relay mode:
```bash
protege relay bootstrap --relay-ws-url wss://relay.example.com/ws
```
6. Start gateway:
```bash
protege gateway start
```
7. Verify runtime:
```bash
protege status --json
protege doctor
```

## Core Commands

1. `protege --help`
2. `protege --version`
3. `protege gateway start|stop|restart [--dev]`
4. `protege persona create|list|info|use|delete ...`
5. `protege relay bootstrap --relay-ws-url <ws_url>`
6. `protege status [--json]`
7. `protege logs [--follow] [--tail <n>] [--scope <scope>] [--json]`
8. `protege doctor [--json]`

## User Guides

1. `guide/README.md`
2. `guide/cli.md`
3. `guide/relay.md`
4. `guide/troubleshooting.md`

## Internal Docs

1. `docs/protege-implementation-plan-v3.md`
2. `docs/adr/README.md`
3. `docs/conventions/README.md`
4. `docs/status.md`
5. `AGENTS.md`
