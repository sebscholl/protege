import type { HarnessContextHistoryEntry } from '@engine/harness/types';

/**
 * Represents one context resolver invocation shape with stable top-level keys.
 */
export type ResolverInvocation = {
  type: 'thread' | 'responsibility';
  context: Record<string, unknown>;
};

/**
 * Represents one normalized resolver output payload consumed by context pipeline execution.
 */
export type ResolverOutput = string | {
  sections?: string[];
  activeMemory?: string;
  history?: HarnessContextHistoryEntry[];
  inputText?: string;
};

/**
 * Represents one resolver module definition export contract.
 */
export type HarnessResolverDefinition = {
  name: string;
  resolve: (
    args: {
      invocation: ResolverInvocation;
      config: Record<string, unknown>;
    },
  ) => Promise<ResolverOutput | null | undefined> | ResolverOutput | null | undefined;
};

/**
 * Represents one loaded resolver registry entry with merged config.
 */
export type HarnessResolverEntry = {
  name: string;
  config: Record<string, unknown>;
  resolve: HarnessResolverDefinition['resolve'];
};
