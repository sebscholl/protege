# Providers

Providers are LLM API adapters. Each provider translates Protege's normalized message format into the vendor-specific API shape (OpenAI, Anthropic, etc.) and translates the response back. This lets you swap LLM providers without changing anything else in your agent.

## Built-In Providers

Protege ships with four provider adapters:

| Provider | Default API Key Env | Capabilities |
|----------|-------------------|--------------|
| **OpenAI** | `OPENAI_API_KEY` | tools, structured output |
| **Anthropic** | `ANTHROPIC_API_KEY` | tools |
| **Gemini** | `GEMINI_API_KEY` | tools |
| **Grok** | `GROK_API_KEY` | tools |

## Selecting Your Provider

Your active provider and model are set in `configs/inference.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "max_output_tokens": 4096,
  "max_tool_turns": 8
}
```

The `provider` field selects which adapter to use. The `model` field is the provider-specific model name (without the provider prefix).

Internally, Protege combines these into a normalized model ID: `anthropic/claude-sonnet-4-20250514`.

## Manifest Configuration

### Enable providers with defaults

```json
{
  "providers": ["openai", "anthropic", "gemini", "grok"]
}
```

### Override provider settings

```json
{
  "providers": [
    {
      "name": "openai",
      "config": {
        "api_key_env": "OPENAI_API_KEY",
        "base_url": "https://api.openai.com/v1"
      }
    },
    {
      "name": "anthropic",
      "config": {
        "api_key_env": "ANTHROPIC_API_KEY",
        "version": "2023-06-01"
      }
    }
  ]
}
```

### Configuration keys

All providers support:

| Key | Description |
|-----|-------------|
| `api_key_env` | Environment variable name containing the API key |
| `api_key` | Direct API key value (not recommended — use `api_key_env` instead) |
| `base_url` | Custom API endpoint URL |

Anthropic additionally supports:

| Key | Description |
|-----|-------------|
| `version` | API version header value |

### Credential resolution

The engine resolves credentials in this order:

1. `api_key` in manifest config (direct value)
2. Environment variable named by `api_key_env`
3. Default env var for the provider (e.g., `OPENAI_API_KEY` for OpenAI)

Store your keys in `.secrets` or set them in your shell environment:

```bash
# .secrets
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```
