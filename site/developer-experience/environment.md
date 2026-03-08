# Environment and Secrets

Protege loads API keys and other sensitive values from environment files at startup. This keeps secrets out of your configuration files and version control.

## Secret Files

Protege reads environment variables from two files in your project root:

| File | Purpose |
|------|---------|
| `.secrets` | Primary secrets file |
| `.secrets.local` | Local overrides (higher priority) |

Both use standard `KEY=value` format, one variable per line:

```bash
# .secrets
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
TAVILY_API_KEY=tvly-...
```

**Priority order** (highest to lowest):
1. Shell environment variables (already set in your terminal)
2. `.secrets.local`
3. `.secrets`

If a variable is already set in your shell, Protege won't overwrite it from the files.

## Required Keys

Which keys you need depends on your configuration:

### LLM provider (required — pick one)

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| Grok | `GROK_API_KEY` |

### Web search (optional — if `web-search` tool is enabled)

| Provider | Environment Variable |
|----------|---------------------|
| Tavily | `TAVILY_API_KEY` |
| Perplexity | `PERPLEXITY_API_KEY` |

## How Credentials Are Resolved

Provider adapters resolve their API key through a chain:

1. **Direct value** — `api_key` field in the manifest config (not recommended)
2. **Environment variable** — name specified by `api_key_env` in the manifest config
3. **Default env var** — the standard variable for that provider (e.g., `OPENAI_API_KEY`)

For example, this manifest entry:

```json
{
  "name": "openai",
  "config": {
    "api_key_env": "MY_CUSTOM_OPENAI_KEY"
  }
}
```

Would look for `MY_CUSTOM_OPENAI_KEY` instead of the default `OPENAI_API_KEY`.

## Scaffolding

`protege init` and `protege setup` create a `.secrets.example` file showing all supported keys:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROK_API_KEY=
PERPLEXITY_API_KEY=
TAVILY_API_KEY=
```

Copy it to `.secrets` and fill in the values you need.

## Best Practices

- **Never commit `.secrets`** — add it to your `.gitignore`
- **Use `.secrets.local`** for machine-specific overrides when working across environments
- **Use `api_key_env`** indirection in the manifest rather than putting keys directly in JSON
- **Run `protege doctor`** after changing keys — it validates that required credentials are present
