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
 * Loads optional persona knowledge CONTENT.md guidance for file-discovery planning.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'knowledge-guidance',
  resolve: ({ invocation }): string | null => {
    const personaId = typeof invocation.context.personaId === 'string'
      ? invocation.context.personaId
      : '';
    if (personaId.length === 0) {
      return null;
    }

    const contentPath = join(process.cwd(), 'personas', personaId, 'knowledge', 'CONTENT.md');
    if (!existsSync(contentPath)) {
      return null;
    }

    const text = readFileSync(contentPath, 'utf8').trim();
    if (text.length === 0) {
      return null;
    }

    return `Knowledge guidance:\n${text}`;
  },
};
