import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Resolves package root path from cli module location.
 */
export function resolvePackageRootDirPath(): string {
  let currentDirPath = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidatePackagePath = join(currentDirPath, 'package.json');
    const candidateEnvExamplePath = join(currentDirPath, '.env.example');
    const candidateGatewayExamplePath = join(currentDirPath, 'config', 'gateway.example.json');
    const candidateExtensionsManifestPath = join(currentDirPath, 'extensions', 'extensions.json');
    if (
      existsSync(candidatePackagePath)
      && existsSync(candidateEnvExamplePath)
      && existsSync(candidateGatewayExamplePath)
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
      sourceFilePath: join(args.packageRootDirPath, 'config', 'gateway.example.json'),
      targetRelativePath: 'config/gateway.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'inference.json'),
      targetRelativePath: 'config/inference.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'inference.local.example.json'),
      targetRelativePath: 'config/inference.local.example.json',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'system-prompt.md'),
      targetRelativePath: 'config/system-prompt.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'config', 'system.json'),
      targetRelativePath: 'config/system.json',
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
      sourceFilePath: join(args.packageRootDirPath, 'personas', 'README.md'),
      targetRelativePath: 'personas/README.md',
    },
    {
      sourceFilePath: join(args.packageRootDirPath, 'memory', 'README.md'),
      targetRelativePath: 'memory/README.md',
    },
  ];
}
