import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents one configured context step in ordered pipeline execution.
 */
export type ContextPipelineStep = {
  kind: 'resolver';
  resolverName: string;
  resolverArgs: string[];
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
 * Parses one resolver-call step string into normalized resolver call representation.
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
  const parsedCall = parseResolverCall({
    resolverCall: step,
  });
  if (parsedCall.resolverName.length === 0) {
    throw new Error(`Context config step ${args.profileName}[${args.index}] has empty resolver name.`);
  }

  return {
    kind: 'resolver',
    resolverName: parsedCall.resolverName,
    resolverArgs: parsedCall.resolverArgs,
  };
}

/**
 * Parses one resolver call string into resolver name and positional string args.
 */
export function parseResolverCall(
  args: {
    resolverCall: string;
  },
): {
  resolverName: string;
  resolverArgs: string[];
} {
  const openParenIndex = args.resolverCall.indexOf('(');
  const closeParenIndex = args.resolverCall.lastIndexOf(')');
  if (openParenIndex === -1 || closeParenIndex === -1) {
    const resolverName = args.resolverCall.trim();
    if (!isValidResolverName({
      value: resolverName,
    })) {
      throw new Error(`Invalid resolver name: ${resolverName}`);
    }

    return {
      resolverName,
      resolverArgs: [],
    };
  }
  if (closeParenIndex < openParenIndex) {
    throw new Error(`Invalid resolver call: ${args.resolverCall}`);
  }

  const resolverName = args.resolverCall.slice(0, openParenIndex).trim();
  if (!isValidResolverName({
    value: resolverName,
  })) {
    throw new Error(`Invalid resolver name: ${resolverName}`);
  }
  const rawArgs = args.resolverCall.slice(openParenIndex + 1, closeParenIndex).trim();
  if (rawArgs.length === 0) {
    return {
      resolverName,
      resolverArgs: [],
    };
  }

  return {
    resolverName,
    resolverArgs: rawArgs
      .split(',')
      .map((value) => normalizeResolverArg({
        value,
      }))
      .filter((value) => value.length > 0),
  };
}

/**
 * Returns true when one resolver name matches supported call-token format.
 */
export function isValidResolverName(
  args: {
    value: string;
  },
): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(args.value);
}

/**
 * Normalizes one resolver arg by trimming and removing one matching quote pair.
 */
export function normalizeResolverArg(
  args: {
    value: string;
  },
): string {
  const trimmed = args.value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const hasSingleQuotes = first === '\'' && last === '\'';
  const hasDoubleQuotes = first === '"' && last === '"';
  if (hasSingleQuotes || hasDoubleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}
