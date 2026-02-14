import type { HarnessProviderCapabilities } from '@engine/harness/provider-contract';

import { describe, expect, it } from 'vitest';

import {
  HarnessProviderError,
  assertProviderCapability,
  isSupportedProviderId,
  parseProviderModelId,
} from '@engine/harness/provider-contract';

let supportedProviderCheck = false;
let unsupportedProviderCheck = false;
let parsedProviderId = '';
let parsedModelName = '';
let invalidModelIdErrorCode = '';
let unsupportedCapabilityErrorCode = '';
const capabilities: HarnessProviderCapabilities = {
  tools: false,
  structuredOutput: true,
  streaming: false,
};

describe('harness provider contract', () => {
  it('recognizes supported provider ids', () => {
    supportedProviderCheck = isSupportedProviderId({ providerId: 'openai' });
    expect(supportedProviderCheck).toBe(true);
  });

  it('rejects unsupported provider ids', () => {
    unsupportedProviderCheck = isSupportedProviderId({ providerId: 'azure' });
    expect(unsupportedProviderCheck).toBe(false);
  });

  it('parses normalized provider/model ids', () => {
    const parsed = parseProviderModelId({ modelId: 'anthropic/claude-3-7-sonnet' });
    parsedProviderId = parsed.providerId;
    parsedModelName = parsed.modelName;
    expect(parsedProviderId).toBe('anthropic');
  });

  it('returns parsed model segment from normalized ids', () => {
    expect(parsedModelName).toBe('claude-3-7-sonnet');
  });

  it('throws invalid_model_id for malformed ids', () => {
    try {
      parseProviderModelId({ modelId: 'invalid-model-format' });
    } catch (error) {
      invalidModelIdErrorCode = (error as HarnessProviderError).code;
    }
    expect(invalidModelIdErrorCode).toBe('invalid_model_id');
  });

  it('throws unsupported_capability when provider flags are false', () => {
    try {
      assertProviderCapability({
        capability: 'tools',
        capabilities,
        providerId: 'openai',
      });
    } catch (error) {
      unsupportedCapabilityErrorCode = (error as HarnessProviderError).code;
    }
    expect(unsupportedCapabilityErrorCode).toBe('unsupported_capability');
  });

  it('does not throw when required capability is enabled', () => {
    expect(() => assertProviderCapability({
      capability: 'structured_output',
      capabilities,
      providerId: 'openai',
    })).not.toThrow();
  });
});
