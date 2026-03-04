import type { ProtegeDatabase } from '@engine/shared/database';

import type { ContextPipelineStep } from '@engine/harness/context/config';
import type { HarnessResolverEntry, ResolverOutput } from '@engine/harness/resolvers/types';
import type { HarnessContext, HarnessContextHistoryEntry, HarnessInput } from '@engine/harness/types';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readContextPipelineConfig } from '@engine/harness/context/config';
import { loadResolverRegistry } from '@engine/harness/resolvers/registry';

/**
 * Represents one context-pipeline invocation payload.
 */
export type ContextPipelineInvocation = {
  type: 'thread' | 'responsibility';
  context: Record<string, unknown>;
};

/**
 * Executes configured context steps and returns assembled harness context.
 */
export async function buildHarnessContextFromPipeline(
  args: {
    db: ProtegeDatabase;
    input: HarnessInput;
    personaId: string;
    maxHistoryTokens: number;
    configPath?: string;
    manifestPath?: string;
  },
): Promise<HarnessContext> {
  const pipelineConfig = readContextPipelineConfig({
    configPath: args.configPath,
  });
  const profile = args.input.source === 'responsibility' ? 'responsibility' : 'thread';
  const steps = profile === 'responsibility'
    ? pipelineConfig.responsibility
    : pipelineConfig.thread;
  const resolverRegistry = await loadResolverRegistry({
    manifestPath: args.manifestPath,
  });
  const invocation = createPipelineInvocation({
    db: args.db,
    input: args.input,
    personaId: args.personaId,
    maxHistoryTokens: args.maxHistoryTokens,
  });

  return executePipelineSteps({
    steps,
    resolverRegistry,
    invocation,
    input: args.input,
  });
}

/**
 * Builds resolver invocation payload for one harness run.
 */
export function createPipelineInvocation(
  args: {
    db: ProtegeDatabase;
    input: HarnessInput;
    personaId: string;
    maxHistoryTokens: number;
  },
): ContextPipelineInvocation {
  return {
    type: args.input.source === 'responsibility' ? 'responsibility' : 'thread',
    context: {
      db: args.db,
      input: args.input,
      threadId: args.input.threadId,
      messageId: args.input.messageId,
      personaId: args.personaId,
      maxHistoryTokens: args.maxHistoryTokens,
    },
  };
}

/**
 * Executes one ordered pipeline and merges contributions into one harness context payload.
 */
export async function executePipelineSteps(
  args: {
    steps: ContextPipelineStep[];
    resolverRegistry: HarnessResolverEntry[];
    invocation: ContextPipelineInvocation;
    input: HarnessInput;
  },
): Promise<HarnessContext> {
  const systemSections: string[] = [];
  let activeMemory = '';
  let history: HarnessContextHistoryEntry[] = [];
  let inputText = args.input.text;

  for (const step of args.steps) {
    if (step.kind === 'file') {
      const expandedPath = expandContextPathTemplate({
        template: step.value,
        context: args.invocation.context,
      });
      const content = readOptionalTrimmedFile({
        filePath: expandedPath,
      });
      if (content.length > 0) {
        systemSections.push(content);
      }
      continue;
    }

    const resolver = resolveRegistryEntry({
      resolverRegistry: args.resolverRegistry,
      resolverName: step.value,
    });
    const output = await resolver.resolve({
      invocation: args.invocation,
      config: resolver.config,
    });
    applyResolverOutput({
      output,
      systemSections,
      applyActiveMemory: (
        nextActiveMemory,
      ): void => {
        activeMemory = nextActiveMemory;
      },
      applyHistory: (
        nextHistory,
      ): void => {
        history = nextHistory;
      },
      applyInputText: (
        nextInputText,
      ): void => {
        inputText = nextInputText;
      },
    });
  }

  return {
    threadId: args.input.threadId,
    activeMemory,
    history,
    input: {
      ...args.input,
      text: inputText,
    },
    systemSections,
  };
}

/**
 * Applies one resolver output payload to mutable pipeline accumulators.
 */
export function applyResolverOutput(
  args: {
    output: ResolverOutput | null | undefined;
    systemSections: string[];
    applyActiveMemory: (activeMemory: string) => void;
    applyHistory: (history: HarnessContextHistoryEntry[]) => void;
    applyInputText: (inputText: string) => void;
  },
): void {
  if (!args.output) {
    return;
  }

  if (typeof args.output === 'string') {
    if (args.output.trim().length > 0) {
      args.systemSections.push(args.output.trim());
    }
    return;
  }

  if (Array.isArray(args.output.sections)) {
    for (const section of args.output.sections) {
      if (typeof section === 'string' && section.trim().length > 0) {
        args.systemSections.push(section.trim());
      }
    }
  }

  if (typeof args.output.activeMemory === 'string') {
    args.applyActiveMemory(args.output.activeMemory.trim());
  }

  if (Array.isArray(args.output.history)) {
    args.applyHistory(args.output.history);
  }

  if (typeof args.output.inputText === 'string') {
    args.applyInputText(args.output.inputText);
  }
}

/**
 * Resolves one named resolver entry from loaded registry.
 */
export function resolveRegistryEntry(
  args: {
    resolverRegistry: HarnessResolverEntry[];
    resolverName: string;
  },
): HarnessResolverEntry {
  const match = args.resolverRegistry.find((entry) => entry.name === args.resolverName);
  if (!match) {
    throw new Error(`Resolver not found in manifest: ${args.resolverName}`);
  }

  return match;
}

/**
 * Expands `{placeholder}` tokens in one path template from invocation context keys.
 */
export function expandContextPathTemplate(
  args: {
    template: string;
    context: Record<string, unknown>;
  },
): string {
  const expanded = args.template.replaceAll(/\{([^{}]+)\}/g, (
    _,
    key,
  ) => {
    const value = args.context[key];
    return typeof value === 'string' ? value : '';
  });

  return join(process.cwd(), expanded);
}

/**
 * Reads one optional file and returns trimmed text when present.
 */
export function readOptionalTrimmedFile(
  args: {
    filePath: string;
  },
): string {
  if (!existsSync(args.filePath)) {
    return '';
  }

  return readFileSync(args.filePath, 'utf8').trim();
}
