# Build a Custom Provider

## Directory Layout

```text
extensions/providers/custom-provider/
  index.ts
  config.json
  README.md
```

## Adapter Example

```ts
import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
} from '@engine/harness/providers/contract';

export const provider: HarnessProviderAdapter = {
  providerId: 'openai',
  capabilities: {
    tools: true,
    structuredOutput: false,
    streaming: false,
  },
  generate: async (
    args: {
      request: HarnessProviderGenerateRequest;
    },
  ): Promise<HarnessProviderGenerateResponse> => {
    void args;

    return {
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop',
    };
  },
};
```

## `config.json` Defaults

```json
{
  "api_key_env": "CUSTOM_PROVIDER_API_KEY",
  "base_url": "https://api.example.com/v1"
}
```

## Manifest Registration

```json
{
  "providers": [
    {
      "name": "custom-provider",
      "config": {
        "api_key_env": "CUSTOM_PROVIDER_API_KEY"
      }
    }
  ]
}
```

## Provider Responsibilities

1. map normalized request messages to provider-native request shape,
2. map provider response back to normalized `text` + `toolCalls`,
3. preserve usage and finish reason when available,
4. throw typed `HarnessProviderError` with stable error codes.

## Error Codes

Use `HarnessProviderError` with codes like:

1. `bad_request`
2. `unauthorized`
3. `rate_limited`
4. `timeout`
5. `unavailable`
6. `provider_internal`
7. `response_parse_failed`
