import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GatewayRuntimeConfig } from '@engine/gateway/index';

import { readGatewayRuntimeConfig, resolveDefaultGatewayConfigPath } from '@engine/gateway/index';
import {
  listPersonas,
  resolvePersonaMemoryPaths,
} from '@engine/shared/personas';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';

/**
 * Represents one typed status snapshot returned by `protege status`.
 */
export type CliStatusSnapshot = {
  gateway: {
    running: boolean;
    mode: GatewayRuntimeConfig['mode'];
    host: string;
    port: number;
  };
  relay: {
    enabled: boolean;
    relayWsUrl: string | null;
  };
  persona: {
    count: number;
  };
  memory: {
    personasWithTemporalDb: number;
    personasWithActiveMd: number;
  };
  paths: {
    logsDir: string;
  };
};

/**
 * Parses `protege status` flags.
 */
export function parseStatusArgs(
  args: {
    argv: string[];
  },
): {
  json: boolean;
} {
  return {
    json: args.argv.includes('--json'),
  };
}

/**
 * Builds one status snapshot from repository config and runtime files.
 */
export function buildStatusSnapshot(): CliStatusSnapshot {
  const gatewayConfig = readGatewayRuntimeConfig({
    configPath: resolveDefaultGatewayConfigPath(),
  });
  const globalConfig = readGlobalRuntimeConfig();
  const personas = listPersonas();
  const memoryByPersona = personas.map((persona) => resolvePersonaMemoryPaths({
    personaId: persona.personaId,
  }));

  return {
    gateway: {
      running: isGatewayRunning(),
      mode: gatewayConfig.mode,
      host: gatewayConfig.host,
      port: gatewayConfig.port,
    },
    relay: {
      enabled: gatewayConfig.relay?.enabled ?? false,
      relayWsUrl: gatewayConfig.relay?.relayWsUrl ?? null,
    },
    persona: {
      count: personas.length,
    },
    memory: {
      personasWithTemporalDb: memoryByPersona.filter((memoryPaths) => existsSync(memoryPaths.temporalDbPath)).length,
      personasWithActiveMd: memoryByPersona.filter((memoryPaths) => existsSync(memoryPaths.activeMemoryPath)).length,
    },
    paths: {
      logsDir: globalConfig.logsDirPath,
    },
  };
}

/**
 * Renders one status snapshot in a simple readable text format.
 */
export function renderStatusSnapshot(
  args: {
    snapshot: CliStatusSnapshot;
  },
): string {
  return [
    `gateway.running: ${args.snapshot.gateway.running}`,
    `gateway.mode: ${args.snapshot.gateway.mode}`,
    `gateway.host: ${args.snapshot.gateway.host}`,
    `gateway.port: ${args.snapshot.gateway.port}`,
    `relay.enabled: ${args.snapshot.relay.enabled}`,
    `relay.relayWsUrl: ${args.snapshot.relay.relayWsUrl ?? 'none'}`,
    `persona.count: ${args.snapshot.persona.count}`,
    `memory.personasWithTemporalDb: ${args.snapshot.memory.personasWithTemporalDb}`,
    `memory.personasWithActiveMd: ${args.snapshot.memory.personasWithActiveMd}`,
    `paths.logsDir: ${args.snapshot.paths.logsDir}`,
  ].join('\n');
}

/**
 * Runs `protege status` and writes either JSON or readable output.
 */
export function runStatusCommand(
  args: {
    argv: string[];
  },
): void {
  const parsed = parseStatusArgs({
    argv: args.argv,
  });
  const snapshot = buildStatusSnapshot();
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return;
  }

  process.stdout.write(`${renderStatusSnapshot({
    snapshot,
  })}\n`);
}

/**
 * Returns true when the tracked gateway process id exists and is alive.
 */
export function isGatewayRunning(): boolean {
  const pidFilePath = join(process.cwd(), 'tmp', 'gateway.pid');
  if (!existsSync(pidFilePath)) {
    return false;
  }

  const pidText = readFileSync(pidFilePath, 'utf8').trim();
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
