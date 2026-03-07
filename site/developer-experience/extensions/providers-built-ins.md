# Built-In Providers

Built-in provider adapters:

1. `openai`
2. `anthropic`
3. `gemini`
4. `grok`

These are loaded from `extensions/providers/{name}/index.ts` and configured via provider-local `config.json` plus manifest overrides.

## Manifest Examples

### Default providers

```json
{
  "providers": [
    "openai",
    "anthropic",
    "gemini",
    "grok"
  ]
}
```

### Override provider config

```json
{
  "providers": [
    {
      "name": "openai",
      "config": {
        "api_key_env": "OPENAI_API_KEY",
        "base_url": "https://api.openai.com/v1"
      }
    }
  ]
}
```

## Default Config Keys

All built-ins support:

1. `api_key_env`
2. `api_key` (direct fallback)
3. `base_url`

Anthropic additionally supports:

1. `version`

## Runtime Resolution

Provider runtime config is resolved by:

1. reading enabled provider entries from `extensions/extensions.json`,
2. selecting `inference.provider`,
3. deep-merging defaults and manifest config,
4. resolving credentials from `api_key` or `api_key_env`.

## Default credential env vars

1. OpenAI: `OPENAI_API_KEY`
2. Anthropic: `ANTHROPIC_API_KEY`
3. Gemini: `GEMINI_API_KEY`
4. Grok: `GROK_API_KEY`
