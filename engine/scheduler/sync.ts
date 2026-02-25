import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { resolveDefaultPersonaRoots } from '@engine/shared/personas';
import {
  disableResponsibility,
  listResponsibilitiesByPersona,
  upsertResponsibility,
} from '@engine/scheduler/storage';

/**
 * Represents one parsed responsibility source file entry.
 */
export type ResponsibilityFileDefinition = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  prompt: string;
  promptPath: string;
  promptHash: string;
};

/**
 * Represents one parsed frontmatter contract for responsibility source files.
 */
export type ResponsibilityFrontmatter = {
  name: string;
  schedule: string;
  enabled: boolean;
};

/**
 * Represents one sync summary result.
 */
export type ResponsibilitySyncResult = {
  upsertedCount: number;
  disabledCount: number;
  parsedCount: number;
};

/**
 * Resolves the canonical responsibilities directory for one persona.
 */
export function resolvePersonaResponsibilitiesDirPath(
  args: {
    personaId: string;
    roots?: PersonaRoots;
  },
): string {
  const roots = args.roots ?? resolveDefaultPersonaRoots();
  return join(roots.personasDirPath, args.personaId, 'responsibilities');
}

/**
 * Parses one responsibility markdown file into structured scheduler definition fields.
 */
export function parseResponsibilityFile(
  args: {
    filePath: string;
  },
): ResponsibilityFileDefinition {
  const markdown = readFileSync(args.filePath, 'utf8');
  const parsed = parseFrontmatterMarkdown({
    markdown,
  });
  const id = basename(args.filePath, '.md');
  const prompt = parsed.body.trim();
  if (prompt.length === 0) {
    throw new Error(`Responsibility prompt body is required: ${args.filePath}`);
  }

  return {
    id,
    name: parsed.frontmatter.name,
    schedule: parsed.frontmatter.schedule,
    enabled: parsed.frontmatter.enabled,
    prompt,
    promptPath: args.filePath,
    promptHash: hashPrompt({
      prompt,
    }),
  };
}

/**
 * Reconciles one persona responsibilities directory into scheduler runtime DB index rows.
 */
export function syncPersonaResponsibilities(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    roots?: PersonaRoots;
    nowIso?: string;
  },
): ResponsibilitySyncResult {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const dirPath = resolvePersonaResponsibilitiesDirPath({
    personaId: args.personaId,
    roots: args.roots,
  });
  const definitions = readResponsibilityFilesFromDirectory({
    dirPath,
  });
  const seenIds = new Set<string>();
  for (const definition of definitions) {
    seenIds.add(definition.id);
    upsertResponsibility({
      db: args.db,
      responsibility: {
        id: definition.id,
        personaId: args.personaId,
        name: definition.name,
        schedule: definition.schedule,
        promptPath: definition.promptPath,
        promptHash: definition.promptHash,
        enabled: definition.enabled,
      },
      nowIso,
    });
  }

  const indexed = listResponsibilitiesByPersona({
    db: args.db,
    personaId: args.personaId,
  });
  const toDisable = indexed.filter((item) => !seenIds.has(item.id) && item.enabled);
  for (const responsibility of toDisable) {
    disableResponsibility({
      db: args.db,
      responsibilityId: responsibility.id,
      nowIso,
    });
  }

  return {
    upsertedCount: definitions.length,
    disabledCount: toDisable.length,
    parsedCount: definitions.length,
  };
}

/**
 * Loads and parses all `.md` responsibility files from one directory path.
 */
export function readResponsibilityFilesFromDirectory(
  args: {
    dirPath: string;
  },
): ResponsibilityFileDefinition[] {
  if (!existsSync(args.dirPath)) {
    return [];
  }

  const fileNames = readdirSync(args.dirPath)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort();
  return fileNames.map((fileName) => parseResponsibilityFile({
    filePath: join(args.dirPath, fileName),
  }));
}

/**
 * Parses simple YAML-like frontmatter and markdown body content.
 */
export function parseFrontmatterMarkdown(
  args: {
    markdown: string;
  },
): {
  frontmatter: ResponsibilityFrontmatter;
  body: string;
} {
  const lines = args.markdown.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Responsibility markdown must start with frontmatter delimiter "---".');
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closingIndex === -1) {
    throw new Error('Responsibility frontmatter is missing closing delimiter "---".');
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join('\n');
  const frontmatterRecord = parseFrontmatterLines({
    lines: frontmatterLines,
  });
  const frontmatter = toResponsibilityFrontmatter({
    record: frontmatterRecord,
  });
  return {
    frontmatter,
    body,
  };
}

/**
 * Parses frontmatter key-value lines into one string record.
 */
export function parseFrontmatterLines(
  args: {
    lines: string[];
  },
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of args.lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid frontmatter line: "${line}"`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    output[key] = rawValue;
  }

  return output;
}

/**
 * Converts one frontmatter record into validated responsibility metadata.
 */
export function toResponsibilityFrontmatter(
  args: {
    record: Record<string, string>;
  },
): ResponsibilityFrontmatter {
  const name = args.record.name?.trim();
  const schedule = args.record.schedule?.trim();
  const enabledRaw = args.record.enabled?.trim().toLowerCase();
  if (!name) {
    throw new Error('Responsibility frontmatter requires "name".');
  }
  if (!schedule) {
    throw new Error('Responsibility frontmatter requires "schedule".');
  }
  if (!enabledRaw) {
    throw new Error('Responsibility frontmatter requires "enabled".');
  }
  if (enabledRaw !== 'true' && enabledRaw !== 'false') {
    throw new Error('Responsibility frontmatter "enabled" must be true or false.');
  }

  return {
    name,
    schedule,
    enabled: enabledRaw === 'true',
  };
}

/**
 * Computes one stable prompt hash for sync-change detection and run snapshots.
 */
export function hashPrompt(
  args: {
    prompt: string;
  },
): string {
  return createHash('sha256').update(args.prompt, 'utf8').digest('hex');
}

