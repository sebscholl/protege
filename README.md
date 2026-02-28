# Protege

Email-native AI agent focused on simplicity, interoperability, and self-sovereignty.

## Why Protege

1. Email-first interface using open protocols.
2. Relay-first onboarding for users without inbound port 25.
3. Local-first runtime where agent logic and memory stay on your machine.

## Current State

1. Gateway, harness core loop, relay mode, and key operator commands are implemented.
2. CLI packaging for npm distribution is in progress and functional for local smoke usage.
3. First-party tools include `web_fetch` and provider-agnostic `web_search` (Tavily/Perplexity adapters).
4. Remaining major scope includes scheduler hardening, hooks, and advanced chat polish.

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
3. Run guided setup (recommended):
```bash
protege setup
```
4. Or scaffold only (advanced/manual setup):
```bash
protege init
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
4. `protege persona create|list|info|delete ... [--json]`
5. `protege relay bootstrap --relay-ws-url <ws_url> [--json]`
6. `protege status [--json]`
7. `protege logs [--follow] [--tail <n>] [--scope <scope>] [--json]`
8. `protege doctor [--json]`
9. `protege init [--path <dir>] [--force] [--json]`
10. `protege setup [--path <dir>] [--force] [--provider <openai|anthropic|gemini|grok>] [--outbound <relay|local>] [--non-interactive] ... [--json]`
11. `protege chat --persona <persona_id_or_prefix> [--thread <thread_id>]`
12. `protege scheduler sync [--persona <persona_id_or_prefix>] [--json]`

`protege setup` prompts interactively by default when setup config flags are omitted.
Most CLI commands render pretty output by default and switch to raw JSON with `--json`.

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
