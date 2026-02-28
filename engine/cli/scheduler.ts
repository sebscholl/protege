import { syncPersonaResponsibilities } from '@engine/scheduler/sync';
import { emitCliOutput } from '@engine/cli/output';
import { initializeDatabase } from '@engine/shared/database';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';
import { resolvePersonaBySelector } from '@engine/shared/persona-selector';
import {
  listPersonas,
  resolvePersonaMemoryPaths,
} from '@engine/shared/personas';

/**
 * Represents parsed scheduler CLI command options.
 */
export type SchedulerCommandOptions = {
  action: 'sync';
  personaSelector?: string;
};

/**
 * Represents one scheduler sync summary row for one persona.
 */
export type SchedulerPersonaSyncSummary = {
  personaId: string;
  upsertedCount: number;
  disabledCount: number;
  parsedCount: number;
};

/**
 * Represents scheduler sync command result payload.
 */
export type SchedulerSyncResult = {
  action: 'sync';
  mode: 'single_persona' | 'all_personas';
  personas: SchedulerPersonaSyncSummary[];
};

/**
 * Parses scheduler CLI args for sync action and options.
 */
export function parseSchedulerArgs(
  args: {
    argv: string[];
  },
): SchedulerCommandOptions {
  const action = args.argv[0];
  if (action !== 'sync') {
    throw new Error('Usage: protege scheduler sync [--persona <persona_id_or_prefix>]');
  }

  let personaSelector: string | undefined;
  for (let index = 1; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--persona') {
      personaSelector = args.argv[index + 1] ?? '';
      index += 1;
    }
  }

  return {
    action,
    personaSelector,
  };
}

/**
 * Runs scheduler control-plane behavior from parsed CLI args.
 */
export async function runSchedulerCommand(
  args: {
    argv: string[];
  },
): Promise<SchedulerSyncResult> {
  const parsed = parseSchedulerArgs({
    argv: args.argv,
  });
  if (parsed.personaSelector && parsed.personaSelector.trim().length > 0) {
    const persona = resolvePersonaForScheduler({
      selector: parsed.personaSelector,
    });
    const summary = syncSchedulerPersona({
      personaId: persona.personaId,
    });
    return {
      action: 'sync',
      mode: 'single_persona',
      personas: [summary],
    };
  }

  const summaries = syncSchedulerAcrossPersonas({});
  return {
    action: 'sync',
    mode: 'all_personas',
    personas: summaries,
  };
}

/**
 * Runs scheduler CLI command and emits output in pretty or JSON mode.
 */
export async function runSchedulerCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const json = args.argv.includes('--json');
  const filteredArgv = args.argv.filter((token) => token !== '--json');
  const result = await runSchedulerCommand({
    argv: filteredArgv,
  });
  emitCliOutput({
    mode: json ? 'json' : 'pretty',
    jsonValue: result,
    prettyText: renderSchedulerSyncResult({
      result,
    }),
  });
}

/**
 * Renders one scheduler sync result payload into readable output.
 */
export function renderSchedulerSyncResult(
  args: {
    result: SchedulerSyncResult;
  },
): string {
  const lines = [
    'Scheduler Sync Completed',
    `mode: ${args.result.mode}`,
    `personas.count: ${args.result.personas.length}`,
  ];

  for (const summary of args.result.personas) {
    lines.push(`${summary.personaId}  parsed=${summary.parsedCount}  upserted=${summary.upsertedCount}  disabled=${summary.disabledCount}`);
  }

  return lines.join('\n');
}

/**
 * Syncs scheduler responsibility index for all personas and returns per-persona summaries.
 */
export function syncSchedulerAcrossPersonas(
  args: {
    fallbackToActivePersona?: boolean;
  },
): SchedulerPersonaSyncSummary[] {
  const personas = listPersonas();
  if (personas.length > 0) {
    return personas.map((persona) => syncSchedulerPersona({
      personaId: persona.personaId,
    }));
  }

  void args.fallbackToActivePersona;
  return [];
}

/**
 * Syncs scheduler responsibility index for one persona.
 */
export function syncSchedulerPersona(
  args: {
    personaId: string;
  },
): SchedulerPersonaSyncSummary {
  const personaMemoryPaths = resolvePersonaMemoryPaths({
    personaId: args.personaId,
  });
  const db = initializeDatabase({
    databasePath: personaMemoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  try {
    const result = syncPersonaResponsibilities({
      db,
      personaId: args.personaId,
    });
    return {
      personaId: args.personaId,
      ...result,
    };
  } finally {
    db.close();
  }
}

/**
 * Resolves scheduler persona selection by explicit selector.
 */
export function resolvePersonaForScheduler(
  args: {
    selector?: string;
  },
): {
  personaId: string;
} {
  const personas = listPersonas();
  if (personas.length === 0) {
    throw new Error('No personas found. Create one with "protege persona create".');
  }

  if (!args.selector || args.selector.trim().length === 0) {
    throw new Error('Scheduler sync selector is required when --persona is provided.');
  }

  const persona = resolvePersonaBySelector({
    selector: args.selector,
    personas,
    ambiguousSelectorMessage: ({
      selector,
    }): string => `Ambiguous persona selector "${selector}". Use a longer prefix.`,
  });

  return {
    personaId: persona.personaId,
  };
}
