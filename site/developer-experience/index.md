# Building Your Agent

Protege is designed as a framework, not an application. The engine handles orchestration — receiving emails, assembling context, running inference, delivering replies — while **extensions** provide the actual capabilities your agent has.

This section covers everything you need to customize and extend your agent.

## Your Agent's Project Structure

```
my-agent/
├── configs/           # Runtime behavior configuration
│   ├── context.json   # What context the LLM sees (resolver pipeline)
│   ├── gateway.json   # Email transport and relay settings
│   ├── inference.json # LLM provider, model, and generation params
│   ├── security.json  # Who can email your agent
│   ├── system.json    # Logging, scheduler, chat settings
│   └── theme.json     # Terminal UI colors
├── extensions/
│   ├── extensions.json  # Master manifest — what's enabled
│   ├── tools/           # Tool implementations
│   ├── providers/       # LLM provider adapters
│   ├── hooks/           # Event observers
│   └── resolvers/       # Context builders
├── personas/            # Agent identities
│   └── {persona_id}/
│       ├── persona.json
│       ├── passport.key
│       ├── PERSONA.md          # Persona-specific instructions
│       ├── responsibilities/   # Scheduled tasks
│       └── knowledge/          # Reference documents
├── memory/              # Runtime data (auto-managed)
│   └── {persona_id}/
│       ├── temporal.db         # Thread history, tool traces
│       └── active.md           # Short-horizon working memory
├── prompts/
│   └── system.md        # Base system prompt
└── .secrets             # API keys (git-ignored)
```

## The Extension System

Everything your agent can do is defined in `extensions/extensions.json`:

```json
{
  "providers": ["anthropic"],
  "tools": ["shell", "read-file", "write-file", "web-search", "send-email"],
  "hooks": [
    { "name": "thread-memory-updater", "events": ["harness.inference.completed"] },
    { "name": "active-memory-updater", "events": ["memory.thread.updated"] }
  ],
  "resolvers": ["load-file", "thread-memory-state", "thread-history", "invocation-metadata", "current-input"]
}
```

Each extension type serves a distinct role:

| Extension | Purpose | Example |
|-----------|---------|---------|
| **[Tools](/developer-experience/extensions/tools)** | Actions the LLM can call | `send_email`, `web_search`, `shell` |
| **[Providers](/developer-experience/extensions/providers)** | LLM API adapters | OpenAI, Anthropic, Gemini, Grok |
| **[Hooks](/developer-experience/extensions/hooks)** | React to runtime events | Update memory after inference, send webhook |
| **[Resolvers](/developer-experience/extensions/resolvers)** | Build context for each inference run | Load files, inject history, add metadata |

## Start Here

If you're new to Protege, read these pages in order:

1. **[Extensions Overview](/developer-experience/extensions/)** — how the manifest works, how config merging works
2. **[Tools](/developer-experience/extensions/tools)** — what your agent can do
3. **[Providers](/developer-experience/extensions/providers)** — which LLMs your agent uses
4. **[Personas and Memory](/developer-experience/personas-memory)** — agent identity and how memory works
5. **[Config Files](/developer-experience/configuration)** — every configuration surface explained

## Reference Pages

- **[Hooks](/developer-experience/extensions/hooks)** — event system and custom observers
- **[Resolvers](/developer-experience/extensions/resolvers)** — context pipeline customization
- **[Environment and Secrets](/developer-experience/environment)** — managing API keys
- **[Security](/developer-experience/security)** — threat model and access policies
