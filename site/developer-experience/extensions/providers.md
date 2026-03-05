# Providers

Providers implement the normalized inference contract and isolate API-specific request/response details.

## Provider Contract

```ts
export type HarnessProviderAdapter = {
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
```

Model IDs are normalized as `provider/model` and parsed by `parseProviderModelId`.

## Built-In Provider Modules

- `extensions/providers/openai/index.ts`
- `extensions/providers/anthropic/index.ts`
- `extensions/providers/gemini/index.ts`
- `extensions/providers/grok/index.ts`

Each provider directory includes `config.json` defaults.

## Default Provider Config Keys

Resolved from provider-local `config.json`, merged with manifest override:

- `api_key_env`
- `api_key` (direct fallback)
- `base_url`
- `version` (Anthropic only)

## Runtime Provider Config Resolution

1. load `extensions/extensions.json -> providers`
2. normalize enabled entries
3. pick selected `inference.provider`
4. merge provider defaults with entry override
5. resolve API key from `api_key` or env lookup by `api_key_env`

## Built-In Defaults

- OpenAI: `OPENAI_API_KEY`, `https://api.openai.com/v1`
- Anthropic: `ANTHROPIC_API_KEY`, `https://api.anthropic.com/v1`, version `2023-06-01`
- Gemini: `GEMINI_API_KEY`, `https://generativelanguage.googleapis.com/v1beta`
- Grok: `GROK_API_KEY`, `https://api.x.ai/v1`

## Build a Custom Provider Adapter

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
  generate: async (args: {
    request: HarnessProviderGenerateRequest;
  }): Promise<HarnessProviderGenerateResponse> => {
    void args;
    return {
      text: 'ok',
      toolCalls: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  },
};
```

Register in `extensions/extensions.json`:

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
