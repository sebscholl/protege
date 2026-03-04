import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents one configured context step in ordered pipeline execution.
 */
export type ContextPipelineStep = {
  kind: 'file' | 'resolver';
  value: string;
};

/**
 * Represents one parsed context pipeline profile keyed by invocation type.
 */
export type ContextPipelineConfig = {
  thread: ContextPipelineStep[];
  responsibility: ContextPipelineStep[];
};

/**
 * Resolves default context-pipeline config path.
 */
export function resolveDefaultContextConfigPath(): string {
  return join(process.cwd(), 'config', 'context.json');
}

/**
 * Returns true when context-pipeline config file exists in the workspace.
 */
export function hasContextConfigFile(
  args: {
    configPath?: string;
  } = {},
): boolean {
  const configPath = args.configPath ?? resolveDefaultContextConfigPath();
  return existsSync(configPath);
}

/**
 * Reads and validates context-pipeline config from disk.
 */
export function readContextPipelineConfig(
  args: {
    configPath?: string;
  } = {},
): ContextPipelineConfig {
  const configPath = args.configPath ?? resolveDefaultContextConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(`Context config not found at ${configPath}`);
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const thread = parseStepList({
    profileName: 'thread',
    value: parsed.thread,
  });
  const responsibility = parseStepList({
    profileName: 'responsibility',
    value: parsed.responsibility,
  });

  return {
    thread,
    responsibility,
  };
}

/**
 * Parses one profile step list into normalized context-pipeline steps.
 */
export function parseStepList(
  args: {
    profileName: 'thread' | 'responsibility';
    value: unknown;
  },
): ContextPipelineStep[] {
  if (!Array.isArray(args.value)) {
    throw new Error(`Context config profile "${args.profileName}" must be an array.`);
  }

  return args.value.map((rawStep, index) => parseStep({
    profileName: args.profileName,
    index,
    rawStep,
  }));
}

/**
 * Parses one `file:` or `resolver:` step string into kind/value representation.
 */
export function parseStep(
  args: {
    profileName: 'thread' | 'responsibility';
    index: number;
    rawStep: unknown;
  },
): ContextPipelineStep {
  if (typeof args.rawStep !== 'string' || args.rawStep.trim().length === 0) {
    throw new Error(`Context config step ${args.profileName}[${args.index}] must be a non-empty string.`);
  }

  const step = args.rawStep.trim();
  if (step.startsWith('file:')) {
    const filePath = step.slice('file:'.length).trim();
    if (filePath.length === 0) {
      throw new Error(`Context config step ${args.profileName}[${args.index}] has empty file path.`);
    }

    return {
      kind: 'file',
      value: filePath,
    };
  }

  if (step.startsWith('resolver:')) {
    const resolverName = step.slice('resolver:'.length).trim();
    if (resolverName.length === 0) {
      throw new Error(`Context config step ${args.profileName}[${args.index}] has empty resolver name.`);
    }

    return {
      kind: 'resolver',
      value: resolverName,
    };
  }

  throw new Error(`Context config step ${args.profileName}[${args.index}] must start with "file:" or "resolver:".`);
}
