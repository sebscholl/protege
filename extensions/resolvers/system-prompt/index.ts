import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Loads global system prompt text as the first context section.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'system-prompt',
  resolve: (): string | null => {
    const systemPromptPath = join(process.cwd(), 'config', 'system-prompt.md');
    if (!existsSync(systemPromptPath)) {
      return null;
    }

    const text = readFileSync(systemPromptPath, 'utf8').trim();
    return text.length > 0 ? text : null;
  },
};
