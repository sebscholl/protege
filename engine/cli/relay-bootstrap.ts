import type { GatewayRuntimeConfig } from '@engine/gateway/index';
import type { PersonaMetadata } from '@engine/shared/personas';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolveDefaultGatewayConfigPath } from '@engine/gateway/index';
import { readPositiveIntOrFallback } from '@engine/shared/number';
import {
  createPersona,
  listPersonas,
  readActivePersonaId,
  setActivePersona,
} from '@engine/shared/personas';

/**
 * Represents parsed relay bootstrap CLI arguments.
 */
export type RelayBootstrapArgs = {
  relayWsUrl: string;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  heartbeatTimeoutMs: number;
};

/**
 * Represents relay bootstrap result details emitted by CLI.
 */
export type RelayBootstrapResult = {
  relayEnabled: true;
  relayWsUrl: string;
  personaId: string;
  createdPersona: boolean;
  gatewayConfigPath: string;
};

/**
 * Parses relay bootstrap argv tokens into normalized relay bootstrap settings.
 */
export function parseRelayBootstrapArgs(
  args: {
    argv: string[];
  },
): RelayBootstrapArgs {
  let relayWsUrl = 'ws://127.0.0.1:8080/ws';
  let reconnectBaseDelayMs = 250;
  let reconnectMaxDelayMs = 8000;
  let heartbeatTimeoutMs = 30000;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--relay-ws-url') {
      relayWsUrl = args.argv[index + 1] ?? relayWsUrl;
      index += 1;
      continue;
    }
    if (token === '--reconnect-base-delay-ms') {
      reconnectBaseDelayMs = readPositiveIntOrFallback({
        raw: args.argv[index + 1],
        fallback: reconnectBaseDelayMs,
      });
      index += 1;
      continue;
    }
    if (token === '--reconnect-max-delay-ms') {
      reconnectMaxDelayMs = readPositiveIntOrFallback({
        raw: args.argv[index + 1],
        fallback: reconnectMaxDelayMs,
      });
      index += 1;
      continue;
    }
    if (token === '--heartbeat-timeout-ms') {
      heartbeatTimeoutMs = readPositiveIntOrFallback({
        raw: args.argv[index + 1],
        fallback: heartbeatTimeoutMs,
      });
      index += 1;
    }
  }

  return {
    relayWsUrl,
    reconnectBaseDelayMs,
    reconnectMaxDelayMs,
    heartbeatTimeoutMs,
  };
}

/**
 * Bootstraps relay mode by ensuring one persona and writing relay gateway config.
 */
export function runRelayBootstrap(
  args: {
    bootstrapArgs: RelayBootstrapArgs;
  },
): RelayBootstrapResult {
  const personaSelection = ensureBootstrapPersona();
  const gatewayConfigPath = resolveDefaultGatewayConfigPath();
  const gatewayConfig = readGatewayConfigOrDefault({
    gatewayConfigPath,
  });
  const updatedConfig: GatewayRuntimeConfig = {
    ...gatewayConfig,
    relay: {
      enabled: true,
      relayWsUrl: args.bootstrapArgs.relayWsUrl,
      reconnectBaseDelayMs: args.bootstrapArgs.reconnectBaseDelayMs,
      reconnectMaxDelayMs: args.bootstrapArgs.reconnectMaxDelayMs,
      heartbeatTimeoutMs: args.bootstrapArgs.heartbeatTimeoutMs,
    },
  };
  mkdirSync(dirname(gatewayConfigPath), { recursive: true });
  writeFileSync(gatewayConfigPath, JSON.stringify(updatedConfig, null, 2));

  return {
    relayEnabled: true,
    relayWsUrl: args.bootstrapArgs.relayWsUrl,
    personaId: personaSelection.persona.personaId,
    createdPersona: personaSelection.created,
    gatewayConfigPath,
  };
}

/**
 * Reads existing gateway config from disk or returns sensible defaults when missing.
 */
export function readGatewayConfigOrDefault(
  args: {
    gatewayConfigPath: string;
  },
): GatewayRuntimeConfig {
  if (!existsSync(args.gatewayConfigPath)) {
    return {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      defaultFromAddress: 'protege@localhost',
    };
  }

  const text = readFileSync(args.gatewayConfigPath, 'utf8');
  return JSON.parse(text) as GatewayRuntimeConfig;
}

/**
 * Ensures one persona exists and one active persona pointer is selected.
 */
export function ensureBootstrapPersona(): {
  persona: PersonaMetadata;
  created: boolean;
} {
  const personas = listPersonas();
  if (personas.length === 0) {
    const createdPersona = createPersona({
      setActive: true,
    });
    return {
      persona: createdPersona,
      created: true,
    };
  }

  const activePersonaId = readActivePersonaId();
  if (activePersonaId) {
    const activePersona = personas.find((persona) => persona.personaId === activePersonaId);
    if (activePersona) {
      return {
        persona: activePersona,
        created: false,
      };
    }
  }

  const firstPersona = personas[0];
  setActivePersona({
    personaId: firstPersona.personaId,
  });
  return {
    persona: firstPersona,
    created: false,
  };
}

/**
 * Resolves the default gateway example config path.
 */
export function resolveDefaultGatewayExampleConfigPath(): string {
  return join(process.cwd(), 'config', 'gateway.example.json');
}
