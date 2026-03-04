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
 * Loads persona active-memory markdown and emits it as active-memory context.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'active-memory',
  resolve: ({ invocation }) => {
    const personaId = typeof invocation.context.personaId === 'string'
      ? invocation.context.personaId
      : '';
    if (personaId.length === 0) {
      return null;
    }

    const activeMemoryPath = join(process.cwd(), 'memory', personaId, 'active.md');
    if (!existsSync(activeMemoryPath)) {
      return null;
    }

    const text = readFileSync(activeMemoryPath, 'utf8').trim();
    if (text.length === 0) {
      return null;
    }

    return {
      activeMemory: text,
      sections: [`Active memory:\n${text}`],
    };
  },
};
