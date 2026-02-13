# Network Testing Conventions

## Directory Structure

Network test utilities live under `tests/network/`.

Required structure:

1. `tests/network/index.ts` exports shared MSW helper APIs.
2. `tests/network/fixtures/` stores fixture definitions.
3. Fixture namespace format is:
   - `tests/network/fixtures/{service}/{endpoint}/{code}.json`

Example:

- `tests/network/fixtures/openai/chat-completions/200.json`
- `tests/network/fixtures/openai/chat-completions/429.json`
- `tests/network/fixtures/anthropic/messages/200.json`

## Fixture-Driven Interception

Tests should declare fixture keys, not request details.

1. Tests reference fixtures by key relative to `tests/network/fixtures/`.
2. Fixture files define request matching (method/path).
3. Fixture files define response payload and metadata.
4. MSW helpers load fixtures and register handlers from fixture metadata.

This keeps tests focused on behavior assertions rather than HTTP wiring.

## Fixture Contract

Each fixture JSON SHOULD contain:

1. `request`
2. `response`
3. Optional `meta`

Suggested shape:

```json
{
  "request": {
    "method": "POST",
    "path": "/v1/chat/completions",
    "pathPattern": "^/v1/chat/completions$"
  },
  "response": {
    "status": 200,
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "id": "chatcmpl_123",
      "choices": [
        { "message": { "role": "assistant", "content": "Hello" } }
      ]
    }
  },
  "meta": {
    "service": "openai",
    "name": "chat-completions success"
  }
}
```

`request.pathPattern` is optional and supports regex matching. When present, helpers should prefer `pathPattern` over exact `path`.

## Helper API Direction

Use a shared helper in `tests/network/index.ts` with fixture-key loading.

Example direction:

```ts
mswIntercept('openai/chat-completions/200', {
  merge: {
    response: {
      body: {
        id: 'chatcmpl_override',
      },
    },
  },
});
```

Guidelines:

1. Helper resolves fixture key to JSON file.
2. Helper registers MSW route from `request.method` + `request.path` or `request.pathPattern` (regex).
3. Optional deep merge override is allowed for per-test customization.
4. If fixture key is missing, helper throws a clear test failure.

## Recommended Endpoint Naming

Use stable endpoint folder names:

1. `chat-completions`
2. `messages`
3. `responses`
4. `embeddings`

Prefer semantic names over raw URL fragments when useful.
