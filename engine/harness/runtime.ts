import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildHarnessContext } from '@engine/harness/context';
import { loadSystemPrompt, readInferenceRuntimeConfig } from '@engine/harness/config';
import type {
  HarnessProviderAdapter,
  HarnessProviderMessage,
  HarnessProviderTool,
} from '@engine/harness/provider-contract';
import { HarnessProviderError } from '@engine/harness/provider-contract';
import { createOpenAiProviderAdapter } from '@engine/harness/providers/openai';
import { storeInboundMessage, storeOutboundMessage } from '@engine/harness/storage';
import type { HarnessToolExecutionContext, HarnessToolRegistry } from '@engine/harness/tool-contract';
import { executeRegisteredTool, loadToolRegistry } from '@engine/harness/tool-registry';
import type { HarnessInput } from '@engine/harness/types';
import { initializeDatabase } from '@engine/shared/database';
import { resolveDefaultPersonaRoots, resolvePersonaMemoryPaths } from '@engine/shared/personas';

/**
 * Represents one normalized harness output after provider completion.
 */
export type HarnessRunResult = {
  responseText: string;
  responseMessageId: string;
  invokedActions: string[];
};

/**
 * Represents one runtime action invoker used by tools to perform side effects.
 */
export type HarnessRuntimeActionInvoker = (
  args: {
    action: string;
    payload: Record<string, unknown>;
  },
) => Promise<Record<string, unknown>>;

/**
 * Persists one inbound message into persona temporal storage.
 */
export function persistInboundMessageForRuntime(
  args: {
    message: InboundNormalizedMessage;
    logger?: GatewayLogger;
    correlationId?: string;
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
        correlationId: args.correlationId ?? null,
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
    senderAddress: string;
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
    logger?: GatewayLogger;
    correlationId?: string;
  },
): Promise<HarnessRunResult> {
  const db = openPersonaDatabaseForMessage({
    message: args.message,
  });
  try {
    args.logger?.info({
      event: 'harness.inference.started',
      context: {
        correlationId: args.correlationId ?? null,
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
    const registry = await loadToolRegistry();
    const providerMessages = buildProviderMessages({
      context,
      systemPrompt: loadSystemPrompt(),
    });
    const toolResult = await executeProviderToolLoop({
      adapter,
      modelId,
      messages: providerMessages,
      tools: buildProviderTools({ registry }),
      temperature: inferenceConfig.temperature,
      maxOutputTokens: inferenceConfig.maxOutputTokens,
      toolContext: createToolExecutionContext({
        invokeRuntimeAction: args.invokeRuntimeAction,
        logger: args.logger,
        correlationId: args.correlationId,
      }),
      registry,
    });

    const responseText = toolResult.responseText.trim();
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
        sender: args.senderAddress,
        recipients: args.message.from.map((item) => item.address),
        subject: args.message.subject,
        text: responseText,
        receivedAt: new Date().toISOString(),
        metadata: {
          provider: inferenceConfig.provider,
          model: inferenceConfig.model,
          usage: toolResult.usage ?? {},
        },
      },
    });
    args.logger?.info({
      event: 'harness.inference.completed',
      context: {
        correlationId: args.correlationId ?? null,
        personaId: args.message.personaId ?? null,
        threadId: args.message.threadId,
        messageId: args.message.messageId,
        responseMessageId,
      },
    });

    return {
      responseText,
      responseMessageId,
      invokedActions: toolResult.invokedActions,
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
    senderAddress: string;
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
    logger?: GatewayLogger;
    correlationId?: string;
  },
): Promise<HarnessRunResult> {
  persistInboundMessageForRuntime({
    message: args.message,
    logger: args.logger,
    correlationId: args.correlationId,
  });
  return runHarnessForPersistedInboundMessage({
    message: args.message,
    senderAddress: args.senderAddress,
    invokeRuntimeAction: args.invokeRuntimeAction,
    logger: args.logger,
    correlationId: args.correlationId,
  });
}

/**
 * Builds provider tool declarations from the loaded runtime registry.
 */
export function buildProviderTools(
  args: {
    registry: HarnessToolRegistry;
  },
): HarnessProviderTool[] {
  return Object.values(args.registry).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Represents one provider loop result with final text and invoked runtime actions.
 */
export type ProviderToolLoopResult = {
  responseText: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  invokedActions: string[];
};

/**
 * Executes one provider request loop with tool-calls until a terminal text response.
 */
export async function executeProviderToolLoop(
  args: {
    adapter: HarnessProviderAdapter;
    modelId: `${'openai' | 'anthropic' | 'gemini' | 'grok'}/${string}`;
    messages: HarnessProviderMessage[];
    tools: HarnessProviderTool[];
    temperature?: number;
    maxOutputTokens?: number;
    toolContext: HarnessToolExecutionContext;
    registry: HarnessToolRegistry;
    maxTurns?: number;
  },
): Promise<ProviderToolLoopResult> {
  const maxTurns = args.maxTurns ?? 8;
  const providerMessages = [...args.messages];
  const correlationId = (
    args.toolContext as HarnessToolExecutionContext & {
      __correlationId?: string;
    }
  ).__correlationId;
  let usage: ProviderToolLoopResult['usage'];
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await args.adapter.generate({
      request: {
        modelId: args.modelId,
        messages: providerMessages,
        tools: args.tools,
        temperature: args.temperature,
        maxOutputTokens: args.maxOutputTokens,
      },
    });
    usage = response.usage ?? usage;

    if (response.toolCalls.length === 0) {
      return {
        responseText: response.text ?? '',
        usage,
        invokedActions: getInvokedActionNames({
          toolContext: args.toolContext,
        }),
      };
    }
    args.toolContext.logger?.info({
      event: 'harness.tool.calls.received',
      context: {
        correlationId: correlationId ?? null,
        count: response.toolCalls.length,
      },
    });

    providerMessages.push({
      role: 'assistant',
      parts: response.text ? [{ type: 'text', text: response.text }] : [],
      toolCalls: response.toolCalls,
    });
    for (const toolCall of response.toolCalls) {
      args.toolContext.logger?.info({
        event: 'harness.tool.call.started',
        context: {
          correlationId: correlationId ?? null,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
        },
      });
      let toolResult: Record<string, unknown>;
      try {
        toolResult = await executeRegisteredTool({
          registry: args.registry,
          name: toolCall.name,
          input: toolCall.input,
          context: args.toolContext,
        });
      } catch (error) {
        args.toolContext.logger?.error({
          event: 'harness.tool.call.failed',
          context: {
            correlationId: correlationId ?? null,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            message: (error as Error).message,
          },
        });
        throw error;
      }
      args.toolContext.logger?.info({
        event: 'harness.tool.call.completed',
        context: {
          correlationId: correlationId ?? null,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
        },
      });
      providerMessages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        parts: [{
          type: 'text',
          text: JSON.stringify(toolResult),
        }],
      });
    }
  }

  throw new HarnessProviderError({
    code: 'response_parse_failed',
    message: `Provider exceeded maximum tool loop turns (${maxTurns}).`,
  });
}

/**
 * Creates tool execution context and tracks action invocations across one run.
 */
export function createToolExecutionContext(
  args: {
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
    logger?: GatewayLogger;
    correlationId?: string;
  },
): HarnessToolExecutionContext {
  const invokedActions: string[] = [];
  const context: HarnessToolExecutionContext = {
    runtime: {
      invoke: async (
        invokeArgs: {
          action: string;
          payload: Record<string, unknown>;
        },
      ): Promise<Record<string, unknown>> => {
        invokedActions.push(invokeArgs.action);
        if (!args.invokeRuntimeAction) {
          throw new Error(`Runtime action is not configured: ${invokeArgs.action}`);
        }

        return args.invokeRuntimeAction(invokeArgs);
      },
    },
    logger: args.logger,
  };
  Object.assign(context, {
    __correlationId: args.correlationId,
  });
  Object.assign(context, {
    __invokedActions: invokedActions,
  });
  return context;
}

/**
 * Returns tracked runtime action names from one tool execution context.
 */
export function getInvokedActionNames(
  args: {
    toolContext: HarnessToolExecutionContext;
  },
): string[] {
  const contextRecord = args.toolContext as HarnessToolExecutionContext & {
    __invokedActions?: string[];
  };
  return contextRecord.__invokedActions ?? [];
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
      from: args.message.from.map((item) => item.address),
      to: args.message.to.map((item) => item.address),
      cc: args.message.cc.map((item) => item.address),
      bcc: args.message.bcc.map((item) => item.address),
      replyToDefault: args.message.from[0]?.address ?? '',
      replyFromAddress: args.message.envelopeRcptTo[0]?.address ?? args.message.to[0]?.address ?? '',
    },
  };
}

/**
 * Builds normalized provider messages from system prompt, active memory, history, and input.
 */
export function buildProviderMessages(
  args: {
    context: {
      threadId: string;
      activeMemory: string;
      history: Array<{
        direction: 'inbound' | 'outbound' | 'synthetic';
        messageId: string;
        text: string;
      }>;
      input: {
        messageId: string;
        text: string;
        metadata?: Record<string, unknown>;
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
  const inboundRoutingContext = buildInboundRoutingContextNote({
    input: args.context.input,
    threadId: args.context.threadId,
  });
  if (inboundRoutingContext.length > 0) {
    systemParts.push(inboundRoutingContext);
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
 * Builds one deterministic email-routing context note for tool-call address selection.
 */
export function buildInboundRoutingContextNote(
  args: {
    input: {
      messageId: string;
      metadata?: Record<string, unknown>;
    };
    threadId?: string;
  },
): string {
  const metadata = args.input.metadata ?? {};
  const from = readStringArrayMetadata({
    value: metadata.from,
  });
  const to = readStringArrayMetadata({
    value: metadata.to,
  });
  const cc = readStringArrayMetadata({
    value: metadata.cc,
  });
  const bcc = readStringArrayMetadata({
    value: metadata.bcc,
  });
  const references = readStringArrayMetadata({
    value: metadata.references,
  });
  const replyToDefault = typeof metadata.replyToDefault === 'string'
    ? metadata.replyToDefault
    : '';
  const replyFromAddress = typeof metadata.replyFromAddress === 'string'
    ? metadata.replyFromAddress
    : '';

  if (
    from.length === 0
    && to.length === 0
    && cc.length === 0
    && bcc.length === 0
    && replyToDefault.length === 0
    && replyFromAddress.length === 0
  ) {
    return '';
  }

  return [
    'Inbound email routing context:',
    `- message_id: ${args.input.messageId}`,
    `- thread_id: ${args.threadId ?? 'unknown'}`,
    `- reply_to_default: ${replyToDefault || 'unknown'}`,
    `- reply_from_address: ${replyFromAddress || 'unknown'}`,
    `- from: ${from.join(', ') || 'none'}`,
    `- to: ${to.join(', ') || 'none'}`,
    `- cc: ${cc.join(', ') || 'none'}`,
    `- bcc: ${bcc.join(', ') || 'none'}`,
    `- references: ${references.join(', ') || 'none'}`,
    'If responding by email, use send_email with concrete email addresses. Do not use labels like "user".',
    'For normal replies, send_email.to should usually include reply_to_default.',
    'Threading defaults to replying on the current message. Only set send_email.threadingMode to "new_thread" when intentionally starting a separate thread.',
  ].join('\n');
}

/**
 * Reads one metadata value as a filtered string-array.
 */
export function readStringArrayMetadata(
  args: {
    value: unknown;
  },
): string[] {
  if (!Array.isArray(args.value)) {
    return [];
  }

  return args.value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
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
  const candidates = [
    fileURLToPath(new URL('../shared/migrations', import.meta.url)),
    fileURLToPath(new URL('../engine/shared/migrations', import.meta.url)),
    join(process.cwd(), 'engine', 'shared', 'migrations'),
    join(process.cwd(), 'shared', 'migrations'),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`Could not locate migrations directory. Tried: ${candidates.join(', ')}`);
  }

  return resolved;
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
