# Custom Providers

To connect an LLM not covered by the built-ins (e.g., a self-hosted model, Ollama, or a new API), create a custom provider adapter.

## Example: Ollama Provider

### 1. Create the directory

```
extensions/providers/ollama/
├── index.ts
├── config.json
└── README.md
```

### 2. Implement the adapter contract

Your `index.ts` must export a factory function or a `provider` object matching `HarnessProviderAdapter`:

```ts
import type {
  HarnessProviderAdapter,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
} from 'protege-toolkit';
import { HarnessProviderError } from 'protege-toolkit';

export function createOllamaProviderAdapter(args: {
  config: { baseUrl: string };
}): HarnessProviderAdapter {
  return {
    providerId: 'openai', // Use 'openai' for OpenAI-compatible APIs
    capabilities: {
      tools: true,
      structuredOutput: false,
      streaming: false,
    },
    generate: async (generateArgs: {
      request: HarnessProviderGenerateRequest;
    }): Promise<HarnessProviderGenerateResponse> => {
      const { request } = generateArgs;

      // Map normalized messages to your provider's format
      const response = await fetch(`${args.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.modelId.split('/')[1],
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.parts.map((p) => p.text).join(''),
          })),
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
        }),
      });

      if (!response.ok) {
        throw new HarnessProviderError({
          code: 'provider_internal',
          message: `Ollama returned ${response.status}`,
        });
      }

      const data = await response.json();

      // Map the response back to normalized format
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        toolCalls: [],
        finishReason: data.choices?.[0]?.finish_reason,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
      };
    },
  };
}
```

### 3. Register in the manifest

```json
{
  "providers": [
    {
      "name": "ollama",
      "config": {
        "base_url": "http://localhost:11434"
      }
    }
  ]
}
```

## Provider Responsibilities

Your adapter must:

1. **Map normalized messages** to the provider's native request format
2. **Map the response back** to `text` + `toolCalls` in the normalized shape
3. **Preserve usage metrics** (input/output tokens) when available
4. **Throw `HarnessProviderError`** with stable error codes on failures

## Error Codes

Use these codes when throwing `HarnessProviderError`:

| Code | When to use |
|------|------------|
| `bad_request` | Invalid request shape |
| `unauthorized` | Invalid or missing API key |
| `rate_limited` | Provider rate limit hit |
| `timeout` | Request timed out |
| `unavailable` | Provider service is down |
| `provider_internal` | Unknown provider-side error |
| `response_parse_failed` | Can't parse the response |

## The Provider Contract

For reference, here are the key types:

```ts
type HarnessProviderAdapter = {
  readonly providerId: 'openai' | 'anthropic' | 'gemini' | 'grok';
  readonly capabilities: {
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
  generate: (args: {
    request: HarnessProviderGenerateRequest;
  }) => Promise<HarnessProviderGenerateResponse>;
};

type HarnessProviderGenerateRequest = {
  modelId: string;              // e.g., "anthropic/claude-sonnet-4-20250514"
  messages: HarnessProviderMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  tools?: HarnessProviderTool[];
};

type HarnessProviderGenerateResponse = {
  text?: string;                // The assistant's text response
  toolCalls: HarnessProviderToolCall[];  // Tool calls to execute
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};
```
