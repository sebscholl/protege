type HarnessResolverDefinition = {
  name: string;
  resolve: (
    args: {
      invocation: {
        context: Record<string, unknown>;
      };
    },
  ) => unknown;
};

/**
 * Placeholder resolver for future DB-backed thread memory summaries.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'thread-memory-state',
  resolve: (): null => null,
};
