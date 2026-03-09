import {
  createPersona,
  deletePersona,
  listPersonas,
  type PersonaMetadata,
  readPersonaMetadata,
} from '@engine/shared/personas';

import { emitCliOutput, renderCliKeyValueTable, renderCliTable } from '@engine/cli/output';

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
      displayName: parsed.displayName,
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
  displayName?: string;
} {
  let displayName: string | undefined;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (!token) {
      continue;
    }
    if (!token.startsWith('-') && !displayName) {
      displayName = token;
      continue;
    }
    if (token === '--name') {
      displayName = args.argv[index + 1] || undefined;
      index += 1;
    }
  }

  return {
    displayName,
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
    renderCliKeyValueTable({
      rows: [
        { key: 'personaId', value: args.persona.personaId },
        { key: 'emailAddress', value: args.persona.emailAddress },
        { key: 'displayName', value: args.persona.displayName ?? 'none' },
      ],
    }),
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
    renderCliTable({
      head: ['Persona ID', 'Email Address', 'Display Name'],
      rows: args.personas.map((persona) => [
        persona.personaId,
        persona.emailAddress,
        persona.displayName ?? 'none',
      ]),
    }),
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
    renderCliKeyValueTable({
      rows: [
        { key: 'personaId', value: args.persona.personaId },
        { key: 'emailAddress', value: args.persona.emailAddress },
        { key: 'publicKeyBase32', value: args.persona.publicKeyBase32 },
        { key: 'createdAt', value: args.persona.createdAt },
        { key: 'displayName', value: args.persona.displayName ?? 'none' },
      ],
    }),
  ].join('\n');
}
