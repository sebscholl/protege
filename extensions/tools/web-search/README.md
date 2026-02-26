# web-search

Extension Surface: Yes

`web_search` discovers relevant web results using a config-selected provider adapter.

## What belongs here

1. Input validation for `query` and optional `maxResults`.
2. Tool config loading for provider selection and API key env mapping.
3. Provider-agnostic runtime action mapping to `web.search`.

## What does not belong here

1. Harness registry internals.
2. Non-search network actions.
3. Provider-specific prompt branching in callers.

## Runtime contract

1. Tool name: `web_search`.
2. Runtime action: `web.search`.
3. Provider selection: `extensions/tools/web-search/config.json`.
