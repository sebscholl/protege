import type { HarnessResolverDefinition } from '@engine/harness/resolvers/types';

/**
 * Injects latest inbound text as current input for terminal provider turn.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'current-input',
  resolve: ({ invocation }) => {
    const input = isRecord(invocation.context.input)
      ? invocation.context.input
      : undefined;
    const inputText = input && typeof input.text === 'string'
      ? input.text
      : '';

    return {
      inputText,
    };
  },
};

/**
 * Returns true when one unknown value is a plain object.
 */
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
