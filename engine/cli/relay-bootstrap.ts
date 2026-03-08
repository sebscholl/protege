import type { GatewayRuntimeConfig } from '@engine/gateway/index';
import type { PersonaMetadata } from '@engine/shared/personas';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { resolveDefaultGatewayConfigPath } from '@engine/gateway/index';
import { readPositiveIntOrFallback } from '@engine/shared/number';
import {
  createPersona,
  listPersonas,
  updatePersonaEmailAddress,
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
  updatedPersonaCount: number;
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
 * Bootstraps relay mode by ensuring one bootstrap persona, writing relay config, and reconciling all persona mailbox domains.
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
  const inferredMailDomain = inferMailDomainFromRelayWsUrl({
    relayWsUrl: args.bootstrapArgs.relayWsUrl,
  });
  const effectiveMailDomain = selectRelayBootstrapMailDomain({
    existingMailDomain: gatewayConfig.mailDomain,
    inferredMailDomain,
  });
  const updatedConfig: GatewayRuntimeConfig = {
    ...gatewayConfig,
    mailDomain: effectiveMailDomain,
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
  const updatedPersonas = synchronizeAllBootstrapPersonaMailboxAddresses({
    mailDomain: effectiveMailDomain,
  });

  return {
    relayEnabled: true,
    relayWsUrl: args.bootstrapArgs.relayWsUrl,
    personaId: personaSelection.persona.personaId,
    createdPersona: personaSelection.created,
    updatedPersonaCount: updatedPersonas.length,
    gatewayConfigPath,
  };
}

/**
 * Selects mail domain for relay bootstrap, replacing localhost defaults with inferred relay domain.
 */
export function selectRelayBootstrapMailDomain(
  args: {
    existingMailDomain: string | undefined;
    inferredMailDomain: string;
  },
): string {
  if (!args.existingMailDomain || args.existingMailDomain === 'localhost') {
    return args.inferredMailDomain;
  }

  return args.existingMailDomain;
}

/**
 * Infers one mail domain from relay websocket URL using relay->mail subdomain convention.
 */
export function inferMailDomainFromRelayWsUrl(
  args: {
    relayWsUrl: string;
  },
): string {
  try {
    const url = new URL(args.relayWsUrl);
    if (url.hostname.startsWith('relay.')) {
      return `mail.${url.hostname.slice('relay.'.length)}`;
    }

    return url.hostname;
  } catch {
    return 'localhost';
  }
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
      mailDomain: 'localhost',
    };
  }

  const text = readFileSync(args.gatewayConfigPath, 'utf8');
  return JSON.parse(text) as GatewayRuntimeConfig;
}

/**
 * Ensures one persona exists and returns a deterministic bootstrap persona selection.
 */
export function ensureBootstrapPersona(): {
  persona: PersonaMetadata;
  created: boolean;
} {
  const personas = listPersonas();
  if (personas.length === 0) {
    const createdPersona = createPersona({});
    return {
      persona: createdPersona,
      created: true,
    };
  }

  return {
    persona: personas[0],
    created: false,
  };
}

/**
 * Synchronizes one persona mailbox address from configured mail domain.
 */
export function synchronizeBootstrapPersonaMailboxAddress(
  args: {
    persona: PersonaMetadata;
    mailDomain: string;
  },
): PersonaMetadata {
  return updatePersonaEmailAddress({
    personaId: args.persona.personaId,
    emailAddress: `${args.persona.emailLocalPart}@${args.mailDomain}`,
  });
}

/**
 * Synchronizes all persona mailbox addresses from configured mail domain.
 */
export function synchronizeAllBootstrapPersonaMailboxAddresses(
  args: {
    mailDomain: string;
  },
): PersonaMetadata[] {
  return listPersonas().map((persona) => {
    return synchronizeBootstrapPersonaMailboxAddress({
      persona,
      mailDomain: args.mailDomain,
    });
  });
}
