# .env and Secrets

Protege CLI loads environment variables at startup from:

1. `.env`
2. `.env.local`

Shell-defined env vars are preserved and not overwritten by files.

## Current Secret Keys

From `.env.example`:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`

## Why These Matter

- inference provider adapters resolve credentials via provider config (`api_key_env` or direct `api_key`)
- `web_search` provider adapters resolve credentials from env keys in its tool config

## Credential Resolution Notes

Provider runtime config resolution supports:

- `api_key` direct value in manifest config
- `api_key_env` indirection to env variable

Web search runtime config resolves key from configured provider env field.

## Recommended Practice

- keep behavior config in `config/*.json`
- keep secrets only in `.env` / `.env.local` or process environment
- avoid committing credential files
