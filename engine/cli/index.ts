import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChatCommand } from '@engine/cli/chat';
import { runDoctorCommand } from '@engine/cli/doctor';
import { runGatewayCli } from '@engine/cli/gateway';
import { runInitCli } from '@engine/cli/init';
import { runLogsCommand } from '@engine/cli/logs';
import { emitCliText } from '@engine/cli/output';
import { runPersonaCli } from '@engine/cli/persona';
import { runRelayCli } from '@engine/cli/relay';
import { runSchedulerCli } from '@engine/cli/scheduler';
import { runSetupCli } from '@engine/cli/setup';
import { runStatusCommand } from '@engine/cli/status';

/**
 * Runs the Protege CLI argument parser and dispatches known commands.
 */
export async function runCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  loadCliEnvFiles();
  const [area, ...rest] = args.argv;
  if (!area) {
    emitCliText({ value: readCliHelpText({ topic: 'index' }) });
    return;
  }

  if (isHelpToken({ value: area })) {
    emitCliText({ value: readCliHelpText({
      topic: resolveCliHelpTopic({
        areaToken: rest[0],
        actionToken: rest[1],
      }),
    }), trailingNewlines: 2 });
    return;
  }

  if (isKnownCliCommand({ value: area }) && isHelpToken({ value: rest[0] })) {
    emitCliText({ value: readCliHelpText({ topic: area }), trailingNewlines: 2 });
    return;
  }
  if (isKnownCliCommand({ value: area }) && isHelpToken({ value: rest[1] })) {
    emitCliText({ value: readCliHelpText({
      topic: resolveCliHelpTopic({
        areaToken: area,
        actionToken: rest[0],
      }),
    }), trailingNewlines: 2 });
    return;
  }

  if (area === '-v' || area === '--version' || area === 'version') {
    emitCliText({ value: readPackageVersion(), trailingNewlines: 2 });
    return;
  }

  if (area === 'gateway') {
    await runGatewayCli({ argv: rest });
    return;
  }

  if (area === 'persona') {
    runPersonaCli({ argv: rest });
    return;
  }

  if (area === 'relay') {
    runRelayCli({ argv: rest });
    return;
  }

  if (area === 'status') {
    runStatusCommand({ argv: rest });
    return;
  }

  if (area === 'logs') {
    runLogsCommand({ argv: rest });
    return;
  }

  if (area === 'doctor') {
    runDoctorCommand({ argv: rest });
    return;
  }

  if (area === 'scheduler') {
    await runSchedulerCli({ argv: rest });
    return;
  }

  if (area === 'init') {
    runInitCli({ argv: rest });
    return;
  }

  if (area === 'setup') {
    await runSetupCli({ argv: rest });
    return;
  }

  if (area === 'chat') {
    await runChatCommand({ argv: rest });
    return;
  }

  throw new Error(getCliUsageText());
}

/**
 * Resolves supported dotenv file paths for CLI process startup.
 */
export function resolveCliEnvFilePaths(): string[] {
  return [
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
  ];
}

/**
 * Loads dotenv key/value entries into process.env without overriding existing values.
 */
export function loadCliEnvFiles(): void {
  const shellDefinedKeys = new Set(Object.keys(process.env));
  const filePaths = resolveCliEnvFilePaths();
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const text = readFileSync(filePath, 'utf8');
    const parsed = parseDotEnvText({
      text,
    });
    for (const [key, value] of Object.entries(parsed)) {
      if (shellDefinedKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
    }
  }
}

/**
 * Parses dotenv text content into a key/value record.
 */
export function parseDotEnvText(
  args: {
    text: string;
  },
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of args.text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key.length === 0) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    output[key] = stripDotEnvQuotes({
      value: rawValue,
    });
  }

  return output;
}

/**
 * Strips matching single or double quotes around one dotenv value.
 */
export function stripDotEnvQuotes(
  args: {
    value: string;
  },
): string {
  if (args.value.length < 2) {
    return args.value;
  }

  const first = args.value[0];
  const last = args.value[args.value.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return args.value.slice(1, -1);
  }

  return args.value;
}

/**
 * Returns top-level CLI usage text shown for help and unknown command errors.
 */
export function getCliUsageText(): string {
  return 'Usage: protege <gateway|persona|relay|scheduler|status|logs|doctor|init|setup|chat> ...';
}

/**
 * Returns true when one token maps to CLI help invocation.
 */
export function isHelpToken(
  args: {
    value: string | undefined;
  },
): boolean {
  return args.value === '-h' || args.value === '--help' || args.value === 'help';
}

/**
 * Returns true when one top-level token maps to a known CLI command.
 */
export function isKnownCliCommand(
  args: {
    value: string;
  },
): boolean {
  return args.value === 'gateway'
    || args.value === 'persona'
    || args.value === 'relay'
    || args.value === 'scheduler'
    || args.value === 'status'
    || args.value === 'logs'
    || args.value === 'doctor'
    || args.value === 'init'
    || args.value === 'setup'
    || args.value === 'chat';
}

/**
 * Resolves one help topic token with a fallback to top-level help.
 */
export function resolveCliHelpTopic(
  args: {
    areaToken: string | undefined;
    actionToken?: string | undefined;
  },
): string {
  if (!args.areaToken) {
    return 'index';
  }
  if (isKnownCliCommand({ value: args.areaToken })) {
    if (args.actionToken && args.actionToken.trim().length > 0) {
      const actionTopic = `${args.areaToken}-${args.actionToken}`;
      const actionTopicPath = resolveCliHelpFilePath({
        topic: actionTopic,
      });
      if (actionTopicPath) {
        return actionTopic;
      }
    }

    return args.areaToken;
  }

  return 'index';
}

/**
 * Reads one CLI help text file by topic from `engine/cli/{topic}.help.txt`.
 */
export function readCliHelpText(
  args: {
    topic: string;
  },
): string {
  const helpPath = resolveCliHelpFilePath({
    topic: args.topic,
  });
  if (!helpPath) {
    return getCliUsageText();
  }

  return readFileSync(helpPath, 'utf8').trim();
}

/**
 * Resolves one CLI help file path for a topic name.
 */
export function resolveCliHelpFilePath(
  args: {
    topic: string;
  },
): string | undefined {
  const cliDirPath = dirname(fileURLToPath(import.meta.url));
  const packageRootDirPath = dirname(resolveCliPackageJsonPath());
  const candidates = [
    join(cliDirPath, `${args.topic}.help.txt`),
    join(packageRootDirPath, 'engine', 'cli', `${args.topic}.help.txt`),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Reads package version text from repository root package.json.
 */
export function readPackageVersion(): string {
  const packagePath = resolveCliPackageJsonPath();

  const rawText = readFileSync(packagePath, 'utf8');
  const parsed = JSON.parse(rawText) as {
    version?: unknown;
  };
  return typeof parsed.version === 'string' && parsed.version.trim().length > 0
    ? parsed.version
    : '0.0.0';
}

/**
 * Resolves the package.json path for the installed Protege CLI distribution.
 */
export function resolveCliPackageJsonPath(): string {
  let currentDirPath = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidatePath = join(currentDirPath, 'package.json');
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
    const nextDirPath = dirname(currentDirPath);
    if (nextDirPath === currentDirPath) {
      break;
    }
    currentDirPath = nextDirPath;
  }

  throw new Error('Unable to resolve package.json for CLI version output.');
}

export {
  resolveGatewayPidFilePath,
  stopGatewayCommand,
} from '@engine/cli/gateway';
