import {
  createPersona,
  deletePersona,
  listPersonas,
  type PersonaMetadata,
  readPersonaMetadata,
} from '@engine/shared/personas';

import { emitCliOutput } from '@engine/cli/output';

/**
 * Dispatches persona-specific CLI commands.
 */
export function runPersonaCli(
  args: {
    argv: string[];
  },
): void {
  const json = args.argv.includes('--json');
  const [action, maybeId, ...rest] = args.argv;
  if (!action) {
    throw new Error('Usage: protege persona <create|list|info|delete> ...');
  }

  if (action === 'create') {
    const parsed = parsePersonaCreateArgs({ argv: [maybeId ?? '', ...rest] });
    const persona = createPersona({
      label: parsed.label,
    });
    emitCliOutput({
      mode: json ? 'json' : 'pretty',
      jsonValue: persona,
      prettyText: renderPersonaCreateResult({
        persona,
      }),
    });
    return;
  }

  if (action === 'list') {
    const personas = listPersonas();
    emitCliOutput({
      mode: json ? 'json' : 'pretty',
      jsonValue: personas,
      prettyText: renderPersonaListResult({
        personas,
      }),
    });
    return;
  }

  if (action === 'info') {
    if (!maybeId) {
      throw new Error('Usage: protege persona info <persona_id>');
    }

    const persona = readPersonaMetadata({ personaId: maybeId });
    emitCliOutput({
      mode: json ? 'json' : 'pretty',
      jsonValue: persona,
      prettyText: renderPersonaInfoResult({
        persona,
      }),
    });
    return;
  }

  if (action === 'delete') {
    if (!maybeId) {
      throw new Error('Usage: protege persona delete <persona_id>');
    }

    deletePersona({ personaId: maybeId });
    emitCliOutput({
      mode: json ? 'json' : 'pretty',
      jsonValue: { deletedPersonaId: maybeId },
      prettyText: `Deleted persona: ${maybeId}`,
    });
    return;
  }

  throw new Error('Usage: protege persona <create|list|info|delete> ...');
}

/**
 * Parses persona create CLI flags from a small argv segment.
 */
export function parsePersonaCreateArgs(
  args: {
    argv: string[];
  },
): {
  label?: string;
} {
  let label: string | undefined;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--name') {
      label = args.argv[index + 1] || undefined;
      index += 1;
    }
  }

  return {
    label,
  };
}

/**
 * Renders one persona create result into readable output.
 */
export function renderPersonaCreateResult(
  args: {
    persona: PersonaMetadata;
  },
): string {
  return [
    'Persona Created',
    `personaId: ${args.persona.personaId}`,
    `emailAddress: ${args.persona.emailAddress}`,
    `label: ${args.persona.label ?? 'none'}`,
  ].join('\n');
}

/**
 * Renders one persona list result into readable output.
 */
export function renderPersonaListResult(
  args: {
    personas: PersonaMetadata[];
  },
): string {
  if (args.personas.length === 0) {
    return 'No personas found.';
  }

  return [
    'Personas',
    'personaId    |   emailAddress    |   label',
    ...args.personas.map((persona) => `${persona.personaId}  ${persona.emailAddress}  label=${persona.label ?? 'none'}`),
  ].join('\n');
}

/**
 * Renders one persona info result into readable output.
 */
export function renderPersonaInfoResult(
  args: {
    persona: PersonaMetadata;
  },
): string {
  return [
    'Persona Details',
    `personaId: ${args.persona.personaId}`,
    `emailAddress: ${args.persona.emailAddress}`,
    `publicKeyBase32: ${args.persona.publicKeyBase32}`,
    `createdAt: ${args.persona.createdAt}`,
    `label: ${args.persona.label ?? 'none'}`,
  ].join('\n');
}
