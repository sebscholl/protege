import type { PersonaMetadata } from '@engine/shared/personas';

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGatewayRuntimeConfig, resolveDefaultGatewayConfigPath, startGatewayRuntime } from '@engine/gateway/index';
import { parseRelayBootstrapArgs, runRelayBootstrap } from '@engine/cli/relay-bootstrap';
import {
  createPersona,
  deletePersona,
  listPersonas,
  readPersonaMetadata,
  setActivePersona,
} from '@engine/shared/personas';

const PID_FILE_PATH = join(process.cwd(), 'tmp', 'gateway.pid');

/**
 * Runs the Protege CLI argument parser and dispatches known commands.
 */
export async function runCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const [area, ...rest] = args.argv;

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

  throw new Error('Usage: protege <gateway|persona|relay> ...');
}

/**
 * Dispatches gateway-specific CLI commands.
 */
export async function runGatewayCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const [action, modeFlag] = args.argv;
  if (!action) {
    throw new Error('Usage: protege gateway <start|stop|restart> [--dev]');
  }

  if (action === 'start') {
    await startGatewayCommand({
      dev: modeFlag === '--dev',
    });
    return;
  }

  if (action === 'stop') {
    stopGatewayCommand();
    return;
  }

  if (action === 'restart') {
    stopGatewayCommand();
    await startGatewayCommand({
      dev: modeFlag === '--dev',
    });
    return;
  }

  throw new Error('Usage: protege gateway <start|stop|restart> [--dev]');
}

/**
 * Dispatches persona-specific CLI commands.
 */
export function runPersonaCli(
  args: {
    argv: string[];
  },
): void {
  const [action, maybeId, ...rest] = args.argv;
  if (!action) {
    throw new Error('Usage: protege persona <create|list|info|use|delete> ...');
  }

  if (action === 'create') {
    const parsed = parsePersonaCreateArgs({ argv: [maybeId ?? '', ...rest] });
    const persona = createPersona({
      label: parsed.label,
      setActive: parsed.setActive,
    });
    writeCliJson({ value: persona });
    return;
  }

  if (action === 'list') {
    writeCliJson({ value: listPersonas() });
    return;
  }

  if (action === 'info') {
    if (!maybeId) {
      throw new Error('Usage: protege persona info <persona_id>');
    }

    writeCliJson({ value: readPersonaMetadata({ personaId: maybeId }) });
    return;
  }

  if (action === 'use') {
    if (!maybeId) {
      throw new Error('Usage: protege persona use <persona_id>');
    }

    setActivePersona({ personaId: maybeId });
    writeCliJson({ value: { activePersonaId: maybeId } });
    return;
  }

  if (action === 'delete') {
    if (!maybeId) {
      throw new Error('Usage: protege persona delete <persona_id>');
    }

    deletePersona({ personaId: maybeId });
    writeCliJson({ value: { deletedPersonaId: maybeId } });
    return;
  }

  throw new Error('Usage: protege persona <create|list|info|use|delete> ...');
}

/**
 * Dispatches relay-specific CLI commands.
 */
export function runRelayCli(
  args: {
    argv: string[];
  },
): void {
  const [action, ...rest] = args.argv;
  if (!action) {
    throw new Error('Usage: protege relay <bootstrap> [options]');
  }

  if (action === 'bootstrap') {
    const bootstrapArgs = parseRelayBootstrapArgs({
      argv: rest,
    });
    const result = runRelayBootstrap({
      bootstrapArgs,
    });
    writeCliJson({ value: result });
    return;
  }

  throw new Error('Usage: protege relay <bootstrap> [options]');
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
  setActive: boolean;
} {
  let label: string | undefined;
  let setActive = false;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--set-active') {
      setActive = true;
      continue;
    }

    if (token === '--name') {
      label = args.argv[index + 1] || undefined;
      index += 1;
    }
  }

  return {
    label,
    setActive,
  };
}

/**
 * Writes one JSON payload line to stdout for CLI data responses.
 */
export function writeCliJson(
  args: {
    value: PersonaMetadata | PersonaMetadata[] | Record<string, unknown>;
  },
): void {
  process.stdout.write(`${JSON.stringify(args.value)}\n`);
}

/**
 * Starts the gateway runtime in foreground mode and writes pid marker.
 */
export async function startGatewayCommand(
  args: {
    dev: boolean;
  },
): Promise<void> {
  const configPath = resolveDefaultGatewayConfigPath();
  const baseConfig = readGatewayRuntimeConfig({ configPath });
  const runtimeConfig = args.dev
    ? {
        ...baseConfig,
        mode: 'dev' as const,
      }
    : baseConfig;

  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(PID_FILE_PATH, String(process.pid));

  await startGatewayRuntime({
    config: runtimeConfig,
  });
}

/**
 * Stops a tracked gateway process by pid marker when available.
 */
export function stopGatewayCommand(): void {
  if (!existsSync(PID_FILE_PATH)) {
    stopGatewayByProcessScan();
    return;
  }

  const pidText = readFileSync(PID_FILE_PATH, 'utf8').trim();
  const pid = Number(pidText);
  if (!Number.isNaN(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore if process is already gone.
    }
  }

  unlinkSync(PID_FILE_PATH);
  stopGatewayByProcessScan();
}

/**
 * Stops orphaned gateway start processes when pid marker is missing or stale.
 */
export function stopGatewayByProcessScan(): void {
  const pids = listGatewayStartProcessIds();
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore processes that already exited.
    }
  }
}

/**
 * Lists process ids that match the gateway start command shape.
 */
export function listGatewayStartProcessIds(): number[] {
  try {
    const output = execSync('pgrep -f "engine/cli/index.ts gateway start"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

/**
 * Executes CLI using process arguments when run as node entrypoint.
 */
async function runProcessCli(): Promise<void> {
  await runCli({
    argv: process.argv.slice(2),
  });
}

/**
 * Returns true when this module is executing as the direct process entrypoint.
 */
export function isCliEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntrypoint()) {
  void runProcessCli();
}
