# Getting Started

This flow targets first-time local setup using the current CLI command surface.

## Prerequisites

- Node.js (current project uses ESM and TypeScript tooling)
- npm
- a provider API key (OpenAI, Anthropic, Gemini, or Grok)

## 1) Initialize a Project

```bash
mkdir my-protege
cd my-protege
protege setup
```

`protege setup` is the onboarding command. It can run interactively (default) or non-interactively with flags.

## 2) Start the Gateway

```bash
protege gateway start
```

For local-only development behavior:

```bash
protege gateway start --dev
```

## 3) Validate Runtime

```bash
protege status
protege doctor
```

## 4) View Logs

```bash
protege logs --scope gateway --follow
```

Use `--json` for machine-readable output.

## 5) Open Terminal Inbox

```bash
protege chat --persona <persona_id_or_prefix>
```

## Setup Modes

`protege setup` supports:

- provider selection (`openai | anthropic | gemini | grok`)
- outbound mode (`relay | local`)
- relay websocket URL (when outbound is `relay`)
- optional web-search provider (`none | perplexity | tavily`)
- optional doctor run

## Non-Interactive Example

```bash
protege setup \
  --non-interactive \
  --provider openai \
  --outbound relay \
  --relay-ws-url wss://relay.protege.bot/ws \
  --doctor
```

## Next

- [Relay vs Transport](/getting-started/relay-vs-transport)
- [Config Files](/developer-experience/configuration)
- [CLI Commands](/reference/cli)
