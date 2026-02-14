import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildHarnessContext } from '@engine/harness/context';
import { loadSystemPrompt, readInferenceRuntimeConfig } from '@engine/harness/config';
import type {
  HarnessProviderAdapter,
  HarnessProviderMessage,
} from '@engine/harness/provider-contract';
import { HarnessProviderError } from '@engine/harness/provider-contract';
import { createOpenAiProviderAdapter } from '@engine/harness/providers/openai';
import { storeInboundMessage, storeOutboundMessage } from '@engine/harness/storage';
import type { HarnessInput } from '@engine/harness/types';
import { initializeDatabase } from '@engine/shared/database';
import { resolveDefaultPersonaRoots, resolvePersonaMemoryPaths } from '@engine/shared/personas';

/**
 * Represents one normalized harness output after provider completion.
 */
export type HarnessRunResult = {
  responseText: string;
  responseMessageId: string;
};

/**
 * Persists one inbound message into persona temporal storage.
 */
export function persistInboundMessageForRuntime(
  args: {
    message: InboundNormalizedMessage;
    logger?: GatewayLogger;
  },
): void {
  const db = openPersonaDatabaseForMessage({
    message: args.message,
  });
  try {
    storeInboundMessage({
      db,
      request: {
        message: args.message,
      },
    });
    args.logger?.info({
      event: 'harness.inbound.persisted',
      context: {
        personaId: args.message.personaId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
      },
    });
  } finally {
    db.close();
  }
}

/**
 * Executes inference for one inbound message that is already persisted.
 */
export async function runHarnessForPersistedInboundMessage(
  args: {
    message: InboundNormalizedMessage;
    defaultFromAddress: string;
    logger?: GatewayLogger;
  },
): Promise<HarnessRunResult> {
  const db = openPersonaDatabaseForMessage({
    message: args.message,
  });
  try {
    args.logger?.info({
      event: 'harness.inference.started',
      context: {
        personaId: args.message.personaId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
      },
    });

    const personaMemoryPaths = resolvePersonaMemoryPaths({
      personaId: args.message.personaId as string,
      roots: resolveDefaultPersonaRoots(),
    });
    const input = toHarnessInput({ message: args.message });
    const context = buildHarnessContext({
      db,
      input,
      activeMemoryPath: personaMemoryPaths.activeMemoryPath,
    });

    const inferenceConfig = readInferenceRuntimeConfig();
    const modelId = `${inferenceConfig.provider}/${inferenceConfig.model}` as const;
    const adapter = createProviderAdapter({
      inferenceConfig,
      provider: inferenceConfig.provider,
    });
    const response = await adapter.generate({
      request: {
        modelId,
        messages: buildProviderMessages({
          context,
          systemPrompt: loadSystemPrompt(),
        }),
        temperature: inferenceConfig.temperature,
        maxOutputTokens: inferenceConfig.maxOutputTokens,
      },
    });

    const responseText = response.text?.trim() ?? '';
    if (responseText.length === 0) {
      throw new HarnessProviderError({
        code: 'response_parse_failed',
        message: 'Provider response did not contain assistant text.',
      });
    }

    const responseMessageId = `<protege.${randomUUID()}@localhost>`;
    storeOutboundMessage({
      db,
      request: {
        threadId: args.message.threadId,
        messageId: responseMessageId,
        inReplyTo: args.message.messageId,
        sender: args.defaultFromAddress,
        recipients: args.message.from.map((item) => item.address),
        subject: args.message.subject,
        text: responseText,
        receivedAt: new Date().toISOString(),
        metadata: {
          provider: inferenceConfig.provider,
          model: inferenceConfig.model,
          usage: response.usage ?? {},
        },
      },
    });
    args.logger?.info({
      event: 'harness.inference.completed',
      context: {
        personaId: args.message.personaId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
        responseMessageId,
      },
    });

    return {
      responseText,
      responseMessageId,
    };
  } finally {
    db.close();
  }
}

/**
 * Executes one inbound message through persistence and provider inference.
 */
export async function runHarnessForInboundMessage(
  args: {
    message: InboundNormalizedMessage;
    defaultFromAddress: string;
    logger?: GatewayLogger;
  },
): Promise<HarnessRunResult> {
  persistInboundMessageForRuntime({
    message: args.message,
    logger: args.logger,
  });
  return runHarnessForPersistedInboundMessage({
    message: args.message,
    defaultFromAddress: args.defaultFromAddress,
    logger: args.logger,
  });
}

/**
 * Builds one normalized harness input from inbound gateway message fields.
 */
export function toHarnessInput(
  args: {
    message: InboundNormalizedMessage;
  },
): HarnessInput {
  return {
    source: 'email',
    threadId: args.message.threadId,
    messageId: args.message.messageId,
    sender: args.message.from[0]?.address ?? '',
    recipients: args.message.to.map((item) => item.address),
    subject: args.message.subject,
    text: args.message.text,
    receivedAt: args.message.receivedAt,
    metadata: {
      references: args.message.references,
      personaId: args.message.personaId,
    },
  };
}

/**
 * Builds normalized provider messages from system prompt, active memory, history, and input.
 */
export function buildProviderMessages(
  args: {
    context: {
      activeMemory: string;
      history: Array<{
        direction: 'inbound' | 'outbound' | 'synthetic';
        messageId: string;
        text: string;
      }>;
      input: {
        messageId: string;
        text: string;
      };
    };
    systemPrompt: string;
  },
): HarnessProviderMessage[] {
  const messages: HarnessProviderMessage[] = [];
  const systemParts: string[] = [];
  if (args.systemPrompt.length > 0) {
    systemParts.push(args.systemPrompt);
  }
  if (args.context.activeMemory.length > 0) {
    systemParts.push(`Active memory:\n${args.context.activeMemory}`);
  }
  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      parts: [{ type: 'text', text: systemParts.join('\n\n') }],
    });
  }

  for (const entry of args.context.history) {
    if (entry.messageId === args.context.input.messageId) {
      continue;
    }

    messages.push({
      role: entry.direction === 'outbound' ? 'assistant' : 'user',
      parts: [{ type: 'text', text: entry.text }],
    });
  }

  messages.push({
    role: 'user',
    parts: [{ type: 'text', text: args.context.input.text }],
  });
  return messages;
}

/**
 * Creates one provider adapter implementation for the requested provider id.
 */
export function createProviderAdapter(
  args: {
    inferenceConfig: {
      providers: {
        openai?: {
          apiKey?: string;
          baseUrl?: string;
        };
      };
    };
    provider: 'openai' | 'anthropic' | 'gemini' | 'grok';
  },
): HarnessProviderAdapter {
  if (args.provider === 'openai') {
    const apiKey = args.inferenceConfig.providers.openai?.apiKey;
    if (!apiKey) {
      throw new Error('Missing providers.openai.api_key in config/inference.json.');
    }

    return createOpenAiProviderAdapter({
      config: {
        apiKey,
        baseUrl: args.inferenceConfig.providers.openai?.baseUrl,
      },
    });
  }

  throw new HarnessProviderError({
    code: 'unsupported_provider',
    message: `Provider not yet implemented: ${args.provider}`,
  });
}

/**
 * Resolves migrations directory path independent of process working directory.
 */
export function resolveMigrationsDirPath(): string {
  return fileURLToPath(new URL('../shared/migrations', import.meta.url));
}

/**
 * Opens persona temporal database for one inbound message.
 */
export function openPersonaDatabaseForMessage(
  args: {
    message: InboundNormalizedMessage;
  },
): ProtegeDatabase {
  if (!args.message.personaId) {
    throw new Error('Inbound message is missing personaId required for harness routing.');
  }

  const personaMemoryPaths = resolvePersonaMemoryPaths({
    personaId: args.message.personaId,
    roots: resolveDefaultPersonaRoots(),
  });
  return initializeDatabase({
    databasePath: personaMemoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
}
