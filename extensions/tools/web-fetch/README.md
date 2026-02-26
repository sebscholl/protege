# web-fetch

Extension Surface: Yes

`web_fetch` retrieves one HTTP(S) URL and returns normalized readable content.

## What belongs here

1. Input validation for `url`, `maxBytes`, and `timeoutMs`.
2. Tool schema and execution mapping to runtime action `web.fetch`.
3. Tool-specific result logging fields.

## What does not belong here

1. Generic harness registry logic.
2. Gateway runtime transport orchestration unrelated to `web.fetch`.
3. Provider-specific `web_search` behavior.

## Runtime contract

1. Tool name: `web_fetch`.
2. Runtime action: `web.fetch`.
3. URL scheme support: `http` and `https` only.
