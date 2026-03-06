import type { HarnessProviderId, HarnessProviderMessage } from '@engine/harness/providers/contract';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readInferenceRuntimeConfig } from '@engine/harness/config';
import { resolveSelectedProviderRuntimeConfig } from '@engine/harness/providers/registry';
import { createProviderAdapter } from '@engine/harness/runtime';

/**
 * Represents one provider-backed memory synthesis request.
 */
export type SynthesizeMemoryTextArgs = {
  provider?: HarnessProviderId;
  model?: string;
  promptPath: string;
  inputText: string;
  maxOutputTokens?: number;
  manifestPath?: string;
};

/**
 * Represents one provider-backed memory synthesis response payload.
 */
export type SynthesizeMemoryTextResult = {
  provider: HarnessProviderId;
  model: string;
  outputText: string;
};

/**
 * Resolves provider/model selection using override-first fallback to inference defaults.
 */
export function resolveMemorySynthesisProviderSelection(
  args: {
    provider?: HarnessProviderId;
    model?: string;
  },
): {
  provider: HarnessProviderId;
  model: string;
} {
  const inferenceConfig = readInferenceRuntimeConfig();
  return {
    provider: args.provider ?? inferenceConfig.provider,
    model: args.model ?? inferenceConfig.model,
  };
}

/**
 * Reads synthesis prompt content from disk and fails when missing.
 */
export function readMemorySynthesisPrompt(
  args: {
    promptPath: string;
  },
): string {
  const resolvedPromptPath = resolveWorkspacePath({
    value: args.promptPath,
  });
  if (!existsSync(resolvedPromptPath)) {
    throw new Error(`Memory synthesis prompt not found at ${resolvedPromptPath}`);
  }

  return readFileSync(resolvedPromptPath, 'utf8').trim();
}

/**
 * Executes one provider generate call for memory synthesis text output.
 */
export async function synthesizeMemoryText(
  args: SynthesizeMemoryTextArgs,
): Promise<SynthesizeMemoryTextResult> {
  const selection = resolveMemorySynthesisProviderSelection({
    provider: args.provider,
    model: args.model,
  });
  const promptText = readMemorySynthesisPrompt({
    promptPath: args.promptPath,
  });
  const providerRuntimeConfig = resolveSelectedProviderRuntimeConfig({
    provider: selection.provider,
    manifestPath: args.manifestPath,
  });
  const adapter = createProviderAdapter({
    provider: selection.provider,
    providerConfig: providerRuntimeConfig,
  });
  const messages: HarnessProviderMessage[] = [
    {
      role: 'system',
      parts: [{ type: 'text', text: promptText }],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: args.inputText }],
    },
  ];
  const response = await adapter.generate({
    request: {
      modelId: `${selection.provider}/${selection.model}`,
      messages,
      maxOutputTokens: args.maxOutputTokens,
    },
  });
  const outputText = response.text?.trim();
  if (!outputText || outputText.length === 0) {
    throw new Error('Memory synthesis provider response did not contain assistant text.');
  }

  return {
    provider: selection.provider,
    model: selection.model,
    outputText,
  };
}

/**
 * Resolves one workspace-relative path string into absolute path.
 */
export function resolveWorkspacePath(
  args: {
    value: string;
  },
): string {
  if (args.value.startsWith('/')) {
    return args.value;
  }

  return join(process.cwd(), args.value);
}
