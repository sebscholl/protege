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
 * Loads persona-scoped prompt instructions when PERSONA.md exists.
 */
export const resolver: HarnessResolverDefinition = {
  name: 'persona-prompt',
  resolve: ({ invocation }): string | null => {
    const personaId = typeof invocation.context.personaId === 'string'
      ? invocation.context.personaId
      : '';
    if (personaId.length === 0) {
      return null;
    }

    const personaPromptPath = join(process.cwd(), 'personas', personaId, 'PERSONA.md');
    if (!existsSync(personaPromptPath)) {
      return null;
    }

    const text = readFileSync(personaPromptPath, 'utf8').trim();
    return text.length > 0 ? text : null;
  },
};
