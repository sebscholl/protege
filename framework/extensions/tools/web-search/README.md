# web-search

Extension Surface: Yes

`web_search` discovers relevant web results using a config-selected provider adapter.

## What belongs here

1. Input validation for `query` and optional `maxResults`.
2. Tool config resolution from code defaults + optional manifest overrides.
3. Provider-agnostic runtime action mapping to `web.search`.

## What does not belong here

1. Harness registry internals.
2. Non-search network actions.
3. Provider-specific prompt branching in callers.

## Runtime contract

1. Tool name: `web_search`.
2. Runtime action: `web.search`.
3. Provider selection: `extensions/extensions.json` object entries (`{ "name": "web-search", "config": { ... } }`).

## Default configuration

1. Default provider: `perplexity`.
2. Default `defaultMaxResults`: `5`.
3. Default API key env mapping:
   - `perplexity` -> `PERPLEXITY_API_KEY`
   - `tavily` -> `TAVILY_API_KEY`

## Override configuration

1. Tool entries in `extensions/extensions.json` may be strings or objects.
2. For object entries, `config` is deep-merged over defaults.
3. Merge semantics:
   - objects: recursive merge
   - scalars: override
   - arrays: replace
