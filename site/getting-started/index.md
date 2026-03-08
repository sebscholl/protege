# Quick Start

Get Protege running and send your first email to an AI agent in about 5 minutes.

## Prerequisites

- **Node.js** 18+ (Protege uses ESM modules)
- **npm**
- An **API key** from at least one LLM provider: [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), [Google Gemini](https://aistudio.google.com/apikey), or [Grok](https://console.x.ai/)

## Step 1: Install Protege

```bash
npm install -g protege
```

Verify the installation:

```bash
protege --version
```

## Step 2: Create a Project

A Protege workspace is a directory that holds your configs, extensions, personas, and memory. Create one and run the guided setup:

```bash
mkdir protege-hq && cd protege-hq
protege setup
```

The setup wizard walks you through:

1. **LLM provider** — which provider to use for inference (OpenAI, Anthropic, Gemini, or Grok)
2. **API key** — your provider's API key, stored in a local `.secrets` file
3. **Outbound mode** — `relay` (recommended) or `local` SMTP
4. **Relay URL** — if using relay mode, the WebSocket endpoint (e.g., `wss://relay.protege.bot/ws`)
5. **Web search** — optionally enable web search via Tavily or Perplexity
6. **Health check** — optionally run `protege doctor` to validate everything

After setup, your project directory looks like this:

```
protege-hq/
├── configs/
│   ├── context.json      # Context assembly pipeline
│   ├── gateway.json      # Gateway and transport settings
│   ├── inference.json    # LLM provider and model config
│   ├── security.json     # Sender access policy
│   ├── system.json       # Logging, chat, scheduler settings
│   └── theme.json        # Terminal UI theming
├── extensions/
│   └── extensions.json   # Which tools, providers, hooks to load
├── memory/               # Per-persona runtime data (auto-created)
├── personas/             # Agent identity files (auto-created)
├── prompts/
│   └── system.md         # Base system prompt for your agent
└── .secrets              # API keys (git-ignored)
```

::: tip Prefer non-interactive?
You can skip the wizard entirely:
```bash
protege setup \
  --non-interactive \
  --provider anthropic \
  --inference-api-key sk-ant-... \
  --outbound relay \
  --relay-ws-url wss://relay.protege.bot/ws \
  --doctor
```
:::

## Step 3: Start the Gateway

The gateway is the process that receives emails, runs inference, and sends replies:

```bash
protege gateway start
```

For local development without real email delivery:

```bash
protege gateway start --dev
```

## Step 4: Verify Everything Works

```bash
protege status
```

You should see output confirming the gateway is running, your persona exists, and your config is valid. For a more thorough check:

```bash
protege doctor
```

`doctor` validates your full configuration — config files, personas, provider keys, extension manifest — and reports any issues.

## Step 5: Talk to Your Agent

You have two ways to interact with your agent:

### Option A: Send an email

If you're using relay mode, your agent already has an email address (shown during persona creation). Send it an email from your regular email client. You'll get a reply back.

### Option B: Use the terminal chat

The chat TUI is a development tool for testing your agent locally. In production, the whole point of Protege is that you interact over email — from your phone, your laptop, or wherever you are — not glued to a terminal.

For quick local testing:

```bash
protege chat
```

Press `Ctrl+N` to start a new conversation, type a message, and press `Ctrl+S` to send. Your agent's reply appears in the same thread.

## Step 6: Check the Logs

Watch what your agent is doing in real time:

```bash
protege logs --scope gateway --follow
```

You'll see events for inbound messages, inference runs, tool calls, and outbound delivery.

## What Just Happened?

When you sent a message, here's what Protege did behind the scenes:

1. **Gateway** received and parsed the message, identified which persona it was addressed to
2. **Context pipeline** assembled the system prompt, persona instructions, conversation history, and your message
3. **Harness** sent the assembled context to your configured LLM provider
4. The LLM generated a response (possibly calling tools like `web_search` or `send_email` along the way)
5. **Gateway** delivered the response back to you as an email (or displayed it in chat)

## Next Steps

- [Relay vs Local SMTP](/getting-started/relay-vs-transport) — understand the two connectivity modes
- [Customize your agent](/developer-experience/) — add tools, change providers, write hooks
- [CLI reference](/reference/cli) — full command documentation
