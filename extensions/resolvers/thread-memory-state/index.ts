import type { HarnessResolverDefinition } from '@engine/harness/resolvers/types';

/**
 * Placeholder resolver for future DB-backed thread memory summaries.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'thread-memory-state',
  resolve: (): null => null,
};
