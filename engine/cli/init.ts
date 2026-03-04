import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitCliOutput, renderCliKeyValueTable, renderCliTable } from '@engine/cli/output';

/**
 * Represents parsed `protege init` command options.
 */
export type InitCommandOptions = {
  targetPath: string;
  force: boolean;
};

/**
 * Represents one init command execution result payload.
 */
export type InitCommandResult = {
  targetPath: string;
  createdFiles: string[];
  skippedFiles: string[];
};

/**
 * Represents parsed init CLI output settings.
 */
export type InitCliOptions = {
  json: boolean;
  argvWithoutOutputFlags: string[];
};

/**
 * Parses `protege init` command flags and resolves target path.
 */
export function parseInitArgs(
  args: {
    argv: string[];
  },
): InitCommandOptions {
  let targetPath = process.cwd();
  let force = false;
  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--force') {
      force = true;
      continue;
    }
    if (token === '--path') {
      const candidatePath = args.argv[index + 1];
      if (!candidatePath || candidatePath.trim().length === 0) {
        throw new Error('Usage: protege init [--path <dir>] [--force]');
      }
      targetPath = resolve(candidatePath);
      index += 1;
    }
  }

  return {
    targetPath,
    force,
  };
}

/**
 * Runs project scaffolding by copying baseline runtime files into target path.
 */
export function runInitCommand(
  args: {
    argv: string[];
  },
): InitCommandResult {
  const options = parseInitArgs({
    argv: args.argv,
  });
  const packageRootDirPath = resolvePackageRootDirPath();
  const mappings = buildInitCopyMappings({
    packageRootDirPath,
  });

  mkdirSync(options.targetPath, { recursive: true });
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];
  for (const mapping of mappings) {
    const targetFilePath = join(options.targetPath, mapping.targetRelativePath);
    mkdirSync(dirname(targetFilePath), { recursive: true });
    if (existsSync(targetFilePath) && !options.force) {
      skippedFiles.push(mapping.targetRelativePath);
      continue;
    }
    copyFileSync(mapping.sourceFilePath, targetFilePath);
    createdFiles.push(mapping.targetRelativePath);
  }

  return {
    targetPath: options.targetPath,
    createdFiles,
    skippedFiles,
  };
}

/**
 * Parses one init argv list for output flags and returns remaining command argv.
 */
export function parseInitCliOptions(
  args: {
    argv: string[];
  },
): InitCliOptions {
  const argvWithoutOutputFlags = args.argv.filter((token) => token !== '--json');
  return {
    json: args.argv.includes('--json'),
    argvWithoutOutputFlags,
  };
}

/**
 * Renders one init result payload into readable pretty output.
 */
export function renderInitResult(
  args: {
    result: InitCommandResult;
  },
): string {
  const sections = [
    'Init Completed',
    renderCliKeyValueTable({
      rows: [
        { key: 'targetPath', value: args.result.targetPath },
        { key: 'createdFiles.count', value: args.result.createdFiles.length },
        { key: 'skippedFiles.count', value: args.result.skippedFiles.length },
      ],
    }),
  ];

  if (args.result.createdFiles.length > 0) {
    sections.push('Created Files');
    sections.push(renderCliTable({
      head: ['Path'],
      rows: args.result.createdFiles.map((filePath) => [filePath]),
    }));
  }

  if (args.result.skippedFiles.length > 0) {
    sections.push('Skipped Files');
    sections.push(renderCliTable({
      head: ['Path'],
      rows: args.result.skippedFiles.map((filePath) => [filePath]),
    }));
  }

  return sections.join('\n');
}

/**
 * Runs init command and emits output in pretty or JSON mode.
 */
export function runInitCli(
  args: {
    argv: string[];
  },
): void {
  const cliOptions = parseInitCliOptions({
    argv: args.argv,
  });
  const result = runInitCommand({
    argv: cliOptions.argvWithoutOutputFlags,
  });
  emitCliOutput({
    mode: cliOptions.json ? 'json' : 'pretty',
    jsonValue: result,
    prettyText: renderInitResult({
      result,
    }),
  });
}

/**
 * Resolves package root path from cli module location.
 */
export function resolvePackageRootDirPath(): string {
  let currentDirPath = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidatePackagePath = join(currentDirPath, 'package.json');
    const candidateEnvExamplePath = join(currentDirPath, '.env.example');
    const candidateGatewayConfigPath = join(currentDirPath, 'config', 'gateway.json');
    const candidateExtensionsManifestPath = join(currentDirPath, 'extensions', 'extensions.json');
    if (
      existsSync(candidatePackagePath)
      && existsSync(candidateEnvExamplePath)
      && existsSync(candidateGatewayConfigPath)
      && existsSync(candidateExtensionsManifestPath)
    ) {
      return currentDirPath;
    }

    const nextDirPath = dirname(currentDirPath);
    if (nextDirPath === currentDirPath) {
      break;
    }
    currentDirPath = nextDirPath;
  }

  throw new Error('Unable to resolve package root for protege init scaffolding.');
}

/**
 * Builds static file copy mappings used during project initialization.
 */
export function buildInitCopyMappings(
  args: {
    packageRootDirPath: string;
  },
): Array<{
  sourceFilePath: string;
  targetRelativePath: string;
}> {
  return [
    {
      sourceFilePath: join(args.packageRootDirPath, '.env.example'),
      targetRelativePath: '.env.example',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'gateway.json'),
      targetRelativePath: 'config/gateway.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'inference.json'),
      targetRelativePath: 'config/inference.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'system-prompt.md'),
      targetRelativePath: 'config/system-prompt.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'context.json'),
      targetRelativePath: 'config/context.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'system.json'),
      targetRelativePath: 'config/system.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'security.json'),
      targetRelativePath: 'config/security.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'theme.json'),
      targetRelativePath: 'config/theme.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'extensions.json'),
      targetRelativePath: 'extensions/extensions.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'tools', 'README.md'),
      targetRelativePath: 'extensions/tools/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'hooks', 'README.md'),
      targetRelativePath: 'extensions/hooks/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'README.md'),
      targetRelativePath: 'extensions/providers/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'openai', 'index.ts'),
      targetRelativePath: 'extensions/providers/openai/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'openai', 'config.json'),
      targetRelativePath: 'extensions/providers/openai/config.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'anthropic', 'index.ts'),
      targetRelativePath: 'extensions/providers/anthropic/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'anthropic', 'config.json'),
      targetRelativePath: 'extensions/providers/anthropic/config.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'gemini', 'index.ts'),
      targetRelativePath: 'extensions/providers/gemini/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'gemini', 'config.json'),
      targetRelativePath: 'extensions/providers/gemini/config.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'grok', 'index.ts'),
      targetRelativePath: 'extensions/providers/grok/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'providers', 'grok', 'config.json'),
      targetRelativePath: 'extensions/providers/grok/config.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'README.md'),
      targetRelativePath: 'extensions/resolvers/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'load-file', 'index.ts'),
      targetRelativePath: 'extensions/resolvers/load-file/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'thread-memory-state', 'index.ts'),
      targetRelativePath: 'extensions/resolvers/thread-memory-state/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'invocation-metadata', 'index.ts'),
      targetRelativePath: 'extensions/resolvers/invocation-metadata/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'thread-history', 'index.ts'),
      targetRelativePath: 'extensions/resolvers/thread-history/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'extensions', 'resolvers', 'current-input', 'index.ts'),
      targetRelativePath: 'extensions/resolvers/current-input/index.ts',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'personas', 'README.md'),
      targetRelativePath: 'personas/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'memory', 'README.md'),
      targetRelativePath: 'memory/README.md',
    },
  ];
}
