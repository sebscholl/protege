import type { PersonaMetadata } from '@engine/shared/personas';

import { listPersonas } from '@engine/shared/personas';

/**
 * Resolves one persona by id, id prefix, or email local-part selector.
 */
export function resolvePersonaBySelector(
  args: {
    selector: string;
    personas?: PersonaMetadata[];
    emptyPersonasMessage?: string;
    ambiguousSelectorMessage?: (
      args: {
        selector: string;
      },
    ) => string;
    personaNotFoundMessage?: (
      args: {
        selector: string;
      },
    ) => string;
  },
): PersonaMetadata {
  const personas = args.personas ?? listPersonas();
  if (personas.length === 0) {
    throw new Error(args.emptyPersonasMessage ?? 'No personas found. Create one with "protege persona create".');
  }

  const selector = args.selector.trim().toLowerCase();
  const exact = personas.find((persona) => persona.personaId === selector || persona.emailLocalPart === selector);
  if (exact) {
    return exact;
  }

  const byPrefix = personas.filter((persona) => persona.personaId.startsWith(selector));
  if (byPrefix.length === 1) {
    return byPrefix[0];
  }
  if (byPrefix.length > 1) {
    throw new Error(
      args.ambiguousSelectorMessage?.({
        selector: args.selector,
      }) ?? `Ambiguous persona selector "${args.selector}". Use a longer persona id prefix.`,
    );
  }

  throw new Error(
    args.personaNotFoundMessage?.({
      selector: args.selector,
    }) ?? `Persona not found for selector "${args.selector}".`,
  );
}
