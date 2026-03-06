import type { DoctorReport } from '@engine/cli/doctor';
import type { InitCommandResult } from '@engine/cli/init';
import type { ExtensionManifest, ToolManifestEntry } from '@engine/harness/tools/registry';
import type { GatewayRuntimeConfig } from '@engine/gateway/index';
import type { PersonaMetadata } from '@engine/shared/personas';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { runDoctorChecks } from '@engine/cli/doctor';
import { runInitCommand } from '@engine/cli/init';
import { emitCliOutput, renderCliKeyValueTable } from '@engine/cli/output';
import {
  inferMailDomainFromRelayWsUrl,
  selectRelayBootstrapMailDomain,
} from '@engine/cli/relay-bootstrap';
import {
  createPersona,
  listPersonas,
  updatePersonaEmailAddress,
} from '@engine/shared/personas';

/**
 * Represents supported outbound modes for setup orchestration.
 */
export type SetupOutboundMode = 'relay' | 'local';

/**
 * Represents supported setup web-search provider choices.
 */
export type SetupWebSearchProvider = 'none' | 'perplexity' | 'tavily';

/**
 * Represents parsed `protege setup` options.
 */
export type SetupCommandOptions = {
  targetPath: string;
  force: boolean;
  provider: 'openai' | 'anthropic' | 'gemini' | 'grok';
  inferenceApiKey?: string;
  outboundMode: SetupOutboundMode;
  relayWsUrl: string;
  webSearchProvider: SetupWebSearchProvider;
  webSearchApiKey?: string;
  adminContactEmail?: string;
  runDoctor: boolean;
};

/**
 * Represents parsed setup arguments and whether interactive prompts should run.
 */
export type ParsedSetupArgs = {
  options: SetupCommandOptions;
  interactive: boolean;
};

/**
 * Represents one complete setup command result payload.
 */
export type SetupCommandResult = {
  targetPath: string;
  init: InitCommandResult;
  provider: SetupCommandOptions['provider'];
  outboundMode: SetupOutboundMode;
  relayWsUrl?: string;
  mailDomain: string;
  personaId: string;
  personaEmailAddress: string;
  createdPersona: boolean;
  webSearchProvider: SetupWebSearchProvider;
  wroteEnvKeys: string[];
  nextCommand: string;
  doctor?: DoctorReport;
};

/**
 * Runs the setup workflow as a standalone onboarding command.
 */
export async function runSetupCommand(
  args: {
    argv: string[];
  },
): Promise<SetupCommandResult> {
  const parsedArgs = parseSetupArgs({
    argv: args.argv,
  });
  const seededOptions = hydrateSetupSeedFromExistingProject({
    options: parsedArgs.options,
  });
  const options = parsedArgs.interactive
    ? await promptSetupCommandOptions({
      seed: seededOptions,
    })
    : seededOptions;
  validateSetupCommandOptions({
    options,
  });
  const init = runInitCommand({
    argv: buildInitArgv({
      options,
    }),
  });

  return runWithWorkingDirectory({
    directoryPath: options.targetPath,
    run: (): SetupCommandResult => applySetup({
      options,
      init,
    }),
  });
}

/**
 * Parses setup CLI args into validated command options.
 */
export function parseSetupArgs(
  args: {
    argv: string[];
  },
): ParsedSetupArgs {
  let targetPath = process.cwd();
  let force = false;
  let provider: SetupCommandOptions['provider'] = 'openai';
  let inferenceApiKey: string | undefined;
  let outboundMode: SetupOutboundMode = 'relay';
  let relayWsUrl = 'wss://relay.protege.bot/ws';
  let webSearchProvider: SetupWebSearchProvider = 'none';
  let webSearchApiKey: string | undefined;
  let adminContactEmail: string | undefined;
  let runDoctor = false;
  let nonInteractive = false;

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--path') {
      const candidatePath = args.argv[index + 1];
      if (!candidatePath || candidatePath.trim().length === 0) {
        throw new Error('Usage: protege setup [--path <dir>] [--reset|--force] [--provider <openai|anthropic|gemini|grok>] [--inference-api-key <key>] [--outbound <relay|local>] [--relay-ws-url <url>] [--web-search-provider <none|perplexity|tavily>] [--web-search-api-key <key>] [--admin-contact-email <email>] [--doctor]');
      }
      targetPath = resolve(candidatePath);
      index += 1;
      continue;
    }
    if (token === '--force' || token === '--reset') {
      force = true;
      continue;
    }
    if (token === '--provider') {
      provider = parseProviderName({
        value: args.argv[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--inference-api-key') {
      inferenceApiKey = parseOptionalValue({
        value: args.argv[index + 1],
        flag: '--inference-api-key',
      });
      index += 1;
      continue;
    }
    if (token === '--outbound') {
      outboundMode = parseOutboundMode({
        value: args.argv[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--relay-ws-url') {
      relayWsUrl = parseOptionalValue({
        value: args.argv[index + 1],
        flag: '--relay-ws-url',
      });
      index += 1;
      continue;
    }
    if (token === '--web-search-provider') {
      webSearchProvider = parseWebSearchProvider({
        value: args.argv[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--web-search-api-key') {
      webSearchApiKey = parseOptionalValue({
        value: args.argv[index + 1],
        flag: '--web-search-api-key',
      });
      index += 1;
      continue;
    }
    if (token === '--admin-contact-email') {
      adminContactEmail = parseOptionalValue({
        value: args.argv[index + 1],
        flag: '--admin-contact-email',
      });
      index += 1;
      continue;
    }
    if (token === '--doctor') {
      runDoctor = true;
      continue;
    }
    if (token === '--non-interactive') {
      nonInteractive = true;
      continue;
    }
    if (token === '--json') {
      continue;
    }

    if (typeof token === 'string' && token.startsWith('-')) {
      throw new Error(`Unknown setup option: ${token}`);
    }
  }

  return {
    interactive: shouldRunInteractiveSetup({
      argv: args.argv,
      nonInteractive,
    }),
    options: {
      targetPath,
      force,
      provider,
      inferenceApiKey,
      outboundMode,
      relayWsUrl,
      webSearchProvider,
      webSearchApiKey,
      adminContactEmail,
      runDoctor,
    },
  };
}

/**
 * Returns true when setup CLI argv requests JSON output.
 */
export function shouldRenderSetupAsJson(
  args: {
    argv: string[];
  },
): boolean {
  return args.argv.includes('--json');
}

/**
 * Validates one setup options object and throws actionable errors for invalid values.
 */
export function validateSetupCommandOptions(
  args: {
    options: SetupCommandOptions;
  },
): void {
  if (args.options.outboundMode === 'relay') {
    validateRelayWsUrl({
      relayWsUrl: args.options.relayWsUrl,
    });
  }
  if (typeof args.options.adminContactEmail === 'string' && args.options.adminContactEmail.trim().length > 0) {
    validateEmailAddress({
      emailAddress: args.options.adminContactEmail,
      label: '--admin-contact-email',
    });
  }
}

/**
 * Validates one relay websocket url value.
 */
export function validateRelayWsUrl(
  args: {
    relayWsUrl: string;
  },
): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.relayWsUrl);
  } catch {
    throw new Error('Invalid --relay-ws-url value. Expected a valid ws:// or wss:// URL.');
  }

  if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
    throw new Error('Invalid --relay-ws-url value. Expected ws:// or wss:// protocol.');
  }
}

/**
 * Validates one email address value using a pragmatic v1 format check.
 */
export function validateEmailAddress(
  args: {
    emailAddress: string;
    label: string;
  },
): void {
  const candidate = args.emailAddress.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(candidate)) {
    throw new Error(`Invalid ${args.label} value. Expected a valid email address.`);
  }
}

/**
 * Returns true when setup should run interactive prompts for missing onboarding inputs.
 */
export function shouldRunInteractiveSetup(
  args: {
    argv: string[];
    nonInteractive: boolean;
  },
): boolean {
  if (args.nonInteractive) {
    return false;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  return !hasSetupConfigFlags({
    argv: args.argv,
  });
}

/**
 * Returns true when command argv includes explicit onboarding config flags.
 */
export function hasSetupConfigFlags(
  args: {
    argv: string[];
  },
): boolean {
  const setupConfigFlags = new Set([
    '--provider',
    '--inference-api-key',
    '--outbound',
    '--relay-ws-url',
    '--web-search-provider',
    '--web-search-api-key',
    '--admin-contact-email',
    '--doctor',
  ]);

  return args.argv.some((token) => setupConfigFlags.has(token));
}

/**
 * Prompts for interactive setup values and returns resolved options.
 */
export async function promptSetupCommandOptions(
  args: {
    seed: SetupCommandOptions;
  },
): Promise<SetupCommandOptions> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const provider = parseProviderName({
      value: await promptWithDefault({
        prompt,
        label: 'Inference provider (openai|anthropic|gemini|grok)',
        defaultValue: args.seed.provider,
      }),
    });
    const inferenceApiKey = await promptOptionalValue({
      prompt,
      label: `${readProviderApiKeyEnvName({ provider })} value (optional)`,
    });
    const outboundMode = parseOutboundMode({
      value: await promptWithDefault({
        prompt,
        label: 'Outbound mode (relay|local)',
        defaultValue: args.seed.outboundMode,
      }),
    });
    const relayWsUrl = outboundMode === 'relay'
      ? await promptWithDefault({
        prompt,
        label: 'Relay websocket URL',
        defaultValue: args.seed.relayWsUrl,
      })
      : args.seed.relayWsUrl;
    const webSearchProvider = parseWebSearchProvider({
      value: await promptWithDefault({
        prompt,
        label: 'Web-search provider (none|perplexity|tavily)',
        defaultValue: args.seed.webSearchProvider,
      }),
    });
    const webSearchApiKey = webSearchProvider === 'none'
      ? undefined
      : await promptOptionalValue({
        prompt,
        label: `${readWebSearchApiKeyEnvName({ provider: webSearchProvider })} value (optional)`,
      });
    const adminContactEmail = await promptOptionalValue({
      prompt,
      label: 'Admin contact email for alerts (optional)',
    });
    const runDoctor = parseYesNoResponse({
      value: await promptWithDefault({
        prompt,
        label: 'Run doctor after setup? (y|n)',
        defaultValue: 'y',
      }),
      defaultValue: true,
    });

    return {
      ...args.seed,
      provider,
      inferenceApiKey,
      outboundMode,
      relayWsUrl,
      webSearchProvider,
      webSearchApiKey,
      adminContactEmail,
      runDoctor,
    };
  } finally {
    prompt.close();
  }
}

/**
 * Hydrates setup option defaults from existing project config/env state when available.
 */
export function hydrateSetupSeedFromExistingProject(
  args: {
    options: SetupCommandOptions;
  },
): SetupCommandOptions {
  const targetPath = args.options.targetPath;
  const seeded: SetupCommandOptions = {
    ...args.options,
  };
  const inferenceConfigPath = join(targetPath, 'configs', 'inference.json');
  if (existsSync(inferenceConfigPath)) {
    const inferenceConfig = readJsonFile({
      filePath: inferenceConfigPath,
    }) as {
      provider?: string;
    };
    if (inferenceConfig.provider === 'openai'
      || inferenceConfig.provider === 'anthropic'
      || inferenceConfig.provider === 'gemini'
      || inferenceConfig.provider === 'grok') {
      seeded.provider = inferenceConfig.provider;
    }
  }

  const gatewayConfigPath = join(targetPath, 'configs', 'gateway.json');
  if (existsSync(gatewayConfigPath)) {
    const gatewayConfig = readJsonFile({
      filePath: gatewayConfigPath,
    }) as GatewayRuntimeConfig;
    if (gatewayConfig.relay?.enabled === true) {
      seeded.outboundMode = 'relay';
      if (typeof gatewayConfig.relay.relayWsUrl === 'string' && gatewayConfig.relay.relayWsUrl.trim().length > 0) {
        seeded.relayWsUrl = gatewayConfig.relay.relayWsUrl;
      }
    } else if (gatewayConfig.relay?.enabled === false) {
      seeded.outboundMode = 'local';
    }
  }

  const systemConfigPath = join(targetPath, 'configs', 'system.json');
  if (existsSync(systemConfigPath)) {
    const systemConfig = readJsonFile({
      filePath: systemConfigPath,
    }) as {
      admin_contact_email?: string;
    };
    if (typeof systemConfig.admin_contact_email === 'string') {
      seeded.adminContactEmail = systemConfig.admin_contact_email;
    }
  }

  const extensionsManifestPath = join(targetPath, 'extensions', 'extensions.json');
  if (existsSync(extensionsManifestPath)) {
    const manifest = readJsonFile({
      filePath: extensionsManifestPath,
    }) as ExtensionManifest;
    const webSearchProvider = readWebSearchProviderFromManifest({
      manifest,
    });
    seeded.webSearchProvider = webSearchProvider;
  }

  const envPath = join(targetPath, '.env');
  if (existsSync(envPath)) {
    const envValues = parseDotEnvText({
      text: readFileSync(envPath, 'utf8'),
    });
    const providerEnvName = readProviderApiKeyEnvName({
      provider: seeded.provider,
    });
    const providerEnvValue = envValues[providerEnvName];
    if (typeof providerEnvValue === 'string' && providerEnvValue.length > 0) {
      seeded.inferenceApiKey = providerEnvValue;
    }

    if (seeded.webSearchProvider === 'perplexity') {
      const webSearchEnvValue = envValues.PERPLEXITY_API_KEY;
      if (typeof webSearchEnvValue === 'string' && webSearchEnvValue.length > 0) {
        seeded.webSearchApiKey = webSearchEnvValue;
      }
    }
    if (seeded.webSearchProvider === 'tavily') {
      const webSearchEnvValue = envValues.TAVILY_API_KEY;
      if (typeof webSearchEnvValue === 'string' && webSearchEnvValue.length > 0) {
        seeded.webSearchApiKey = webSearchEnvValue;
      }
    }
  }

  return seeded;
}

/**
 * Reads current web-search provider selection from one extensions manifest.
 */
export function readWebSearchProviderFromManifest(
  args: {
    manifest: ExtensionManifest;
  },
): SetupWebSearchProvider {
  const webSearchEntry = args.manifest.tools.find((toolEntry) => isWebSearchToolEntry({
    entry: toolEntry,
  }));
  if (!webSearchEntry) {
    return 'none';
  }
  if (typeof webSearchEntry === 'string') {
    return 'perplexity';
  }

  if (webSearchEntry.config?.provider === 'tavily') {
    return 'tavily';
  }

  return 'perplexity';
}

/**
 * Prompts one question and returns either trimmed answer or default fallback.
 */
export async function promptWithDefault(
  args: {
    prompt: ReturnType<typeof createInterface>;
    label: string;
    defaultValue: string;
  },
): Promise<string> {
  const answer = (await args.prompt.question(`${args.label} [${args.defaultValue}]: `)).trim();
  return answer.length > 0 ? answer : args.defaultValue;
}

/**
 * Prompts one optional value and returns undefined when answer is blank.
 */
export async function promptOptionalValue(
  args: {
    prompt: ReturnType<typeof createInterface>;
    label: string;
  },
): Promise<string | undefined> {
  const answer = (await args.prompt.question(`${args.label}: `)).trim();
  return answer.length > 0 ? answer : undefined;
}

/**
 * Parses one yes/no answer string with a boolean default fallback.
 */
export function parseYesNoResponse(
  args: {
    value: string;
    defaultValue: boolean;
  },
): boolean {
  const normalized = args.value.trim().toLowerCase();
  if (normalized.length === 0) {
    return args.defaultValue;
  }
  if (normalized === 'y' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'n' || normalized === 'no') {
    return false;
  }

  return args.defaultValue;
}

/**
 * Parses one provider name value and rejects unsupported values.
 */
export function parseProviderName(
  args: {
    value: string | undefined;
  },
): SetupCommandOptions['provider'] {
  if (args.value === 'openai' || args.value === 'anthropic' || args.value === 'gemini' || args.value === 'grok') {
    return args.value;
  }

  throw new Error('Invalid --provider value. Expected one of: openai, anthropic, gemini, grok.');
}

/**
 * Parses one outbound mode value and rejects unsupported values.
 */
export function parseOutboundMode(
  args: {
    value: string | undefined;
  },
): SetupOutboundMode {
  if (args.value === 'relay' || args.value === 'local') {
    return args.value;
  }

  throw new Error('Invalid --outbound value. Expected one of: relay, local.');
}

/**
 * Parses one web-search provider value and rejects unsupported values.
 */
export function parseWebSearchProvider(
  args: {
    value: string | undefined;
  },
): SetupWebSearchProvider {
  if (args.value === 'none' || args.value === 'perplexity' || args.value === 'tavily') {
    return args.value;
  }

  throw new Error('Invalid --web-search-provider value. Expected one of: none, perplexity, tavily.');
}

/**
 * Parses one required flag value and throws a flag-specific usage error when missing.
 */
export function parseOptionalValue(
  args: {
    value: string | undefined;
    flag: string;
  },
): string {
  if (!args.value || args.value.trim().length === 0) {
    throw new Error(`Missing value for ${args.flag}.`);
  }

  return args.value;
}

/**
 * Maps setup options into argv consumed by scaffold-only init command.
 */
export function buildInitArgv(
  args: {
    options: SetupCommandOptions;
  },
): string[] {
  const output = ['--path', args.options.targetPath];
  if (args.options.force) {
    output.push('--force');
  }

  return output;
}

/**
 * Applies setup configuration to one initialized workspace and returns summary details.
 */
export function applySetup(
  args: {
    options: SetupCommandOptions;
    init: InitCommandResult;
  },
): SetupCommandResult {
  const inferenceConfigPath = join(process.cwd(), 'configs', 'inference.json');
  const gatewayConfigPath = join(process.cwd(), 'configs', 'gateway.json');
  const systemConfigPath = join(process.cwd(), 'configs', 'system.json');
  const extensionsManifestPath = join(process.cwd(), 'extensions', 'extensions.json');

  const inferenceConfig = readJsonFile({
    filePath: inferenceConfigPath,
  }) as Record<string, unknown>;
  inferenceConfig.provider = args.options.provider;
  writeJsonFile({
    filePath: inferenceConfigPath,
    value: inferenceConfig,
  });

  const systemConfig = readJsonFile({
    filePath: systemConfigPath,
  }) as Record<string, unknown>;
  if (typeof args.options.adminContactEmail === 'string') {
    systemConfig.admin_contact_email = args.options.adminContactEmail;
  }
  writeJsonFile({
    filePath: systemConfigPath,
    value: systemConfig,
  });

  const gatewayConfig = readJsonFile({
    filePath: gatewayConfigPath,
  }) as GatewayRuntimeConfig;
  const updatedGatewayConfig = applyOutboundModeToGatewayConfig({
    gatewayConfig,
    options: args.options,
  });
  writeJsonFile({
    filePath: gatewayConfigPath,
    value: updatedGatewayConfig,
  });

  const personaSelection = ensureSetupPersona({
    mailDomain: updatedGatewayConfig.mailDomain,
  });
  const manifest = readJsonFile({
    filePath: extensionsManifestPath,
  }) as ExtensionManifest;
  const updatedManifest = applyWebSearchSelectionToManifest({
    manifest,
    provider: args.options.webSearchProvider,
  });
  writeJsonFile({
    filePath: extensionsManifestPath,
    value: updatedManifest,
  });

  const wroteEnvKeys = writeSetupEnvFile({
    filePath: join(process.cwd(), '.env'),
    values: buildSetupEnvValues({
      options: args.options,
    }),
  });

  const doctor = args.options.runDoctor ? runDoctorChecks() : undefined;

  return {
    targetPath: args.options.targetPath,
    init: args.init,
    provider: args.options.provider,
    outboundMode: args.options.outboundMode,
    relayWsUrl: args.options.outboundMode === 'relay' ? args.options.relayWsUrl : undefined,
    mailDomain: updatedGatewayConfig.mailDomain,
    personaId: personaSelection.persona.personaId,
    personaEmailAddress: personaSelection.persona.emailAddress,
    createdPersona: personaSelection.created,
    webSearchProvider: args.options.webSearchProvider,
    wroteEnvKeys,
    nextCommand: readSetupNextCommand({
      runDoctor: args.options.runDoctor,
    }),
    doctor,
  };
}

/**
 * Returns one deterministic next command recommendation after setup completes.
 */
export function readSetupNextCommand(
  args: {
    runDoctor: boolean;
  },
): string {
  if (args.runDoctor) {
    return 'protege gateway start';
  }

  return 'protege doctor && protege gateway start';
}

/**
 * Renders one setup command result as readable terminal output.
 */
export function renderSetupResult(
  args: {
    result: SetupCommandResult;
  },
): string {
  return [
    'Setup Completed',
    renderCliKeyValueTable({
      rows: [
        { key: 'targetPath', value: args.result.targetPath },
        { key: 'provider', value: args.result.provider },
        { key: 'outboundMode', value: args.result.outboundMode },
        { key: 'relayWsUrl', value: args.result.relayWsUrl ?? 'none' },
        { key: 'mailDomain', value: args.result.mailDomain },
        { key: 'personaId', value: args.result.personaId },
        { key: 'personaEmailAddress', value: args.result.personaEmailAddress },
        { key: 'createdPersona', value: args.result.createdPersona },
        { key: 'webSearchProvider', value: args.result.webSearchProvider },
        { key: 'wroteEnvKeys', value: args.result.wroteEnvKeys.length > 0 ? args.result.wroteEnvKeys.join(', ') : 'none' },
        { key: 'nextCommand', value: args.result.nextCommand },
      ],
    }),
  ].join('\n');
}

/**
 * Runs setup command and emits output in pretty or JSON mode.
 */
export async function runSetupCli(
  args: {
    argv: string[];
  },
): Promise<void> {
  const result = await runSetupCommand({
    argv: args.argv,
  });
  emitCliOutput({
    mode: shouldRenderSetupAsJson({ argv: args.argv }) ? 'json' : 'pretty',
    jsonValue: result,
    prettyText: renderSetupResult({
      result,
    }),
  });
}

/**
 * Applies outbound mode setup settings to one gateway config object.
 */
export function applyOutboundModeToGatewayConfig(
  args: {
    gatewayConfig: GatewayRuntimeConfig;
    options: SetupCommandOptions;
  },
): GatewayRuntimeConfig {
  const relayDefaults = readRelayConfigWithDefaults({
    gatewayConfig: args.gatewayConfig,
  });
  const localTransportDefaults = readLocalTransportConfigWithDefaults({
    gatewayConfig: args.gatewayConfig,
  });

  if (args.options.outboundMode === 'local') {
    return {
      ...args.gatewayConfig,
      transport: localTransportDefaults,
      relay: {
        ...relayDefaults,
        enabled: false,
      },
    };
  }

  const inferredMailDomain = inferMailDomainFromRelayWsUrl({
    relayWsUrl: args.options.relayWsUrl,
  });
  const mailDomain = selectRelayBootstrapMailDomain({
    existingMailDomain: args.gatewayConfig.mailDomain,
    inferredMailDomain,
  });

  return {
    ...args.gatewayConfig,
    transport: undefined,
    mailDomain,
    relay: {
      ...relayDefaults,
      enabled: true,
      relayWsUrl: args.options.relayWsUrl,
    },
  };
}

/**
 * Returns one complete local SMTP transport config with required defaults filled.
 */
export function readLocalTransportConfigWithDefaults(
  args: {
    gatewayConfig: GatewayRuntimeConfig;
  },
): NonNullable<GatewayRuntimeConfig['transport']> {
  return {
    host: args.gatewayConfig.transport?.host ?? '127.0.0.1',
    port: args.gatewayConfig.transport?.port ?? 1025,
    secure: args.gatewayConfig.transport?.secure ?? false,
    auth: args.gatewayConfig.transport?.auth,
  };
}

/**
 * Returns one complete relay config object with required defaults filled.
 */
export function readRelayConfigWithDefaults(
  args: {
    gatewayConfig: GatewayRuntimeConfig;
  },
): NonNullable<GatewayRuntimeConfig['relay']> {
  return {
    enabled: args.gatewayConfig.relay?.enabled ?? false,
    relayWsUrl: args.gatewayConfig.relay?.relayWsUrl ?? 'ws://127.0.0.1:8080/ws',
    reconnectBaseDelayMs: args.gatewayConfig.relay?.reconnectBaseDelayMs ?? 250,
    reconnectMaxDelayMs: args.gatewayConfig.relay?.reconnectMaxDelayMs ?? 8000,
    heartbeatTimeoutMs: args.gatewayConfig.relay?.heartbeatTimeoutMs ?? 30000,
  };
}

/**
 * Ensures one setup persona exists and synchronizes its mailbox domain.
 */
export function ensureSetupPersona(
  args: {
    mailDomain: string;
  },
): {
  persona: PersonaMetadata;
  created: boolean;
} {
  const existingPersonas = listPersonas();
  if (existingPersonas.length === 0) {
    return {
      persona: createPersona({
        emailDomain: args.mailDomain,
      }),
      created: true,
    };
  }

  const firstPersona = existingPersonas[0];
  return {
    persona: updatePersonaEmailAddress({
      personaId: firstPersona.personaId,
      emailAddress: `${firstPersona.emailLocalPart}@${args.mailDomain}`,
    }),
    created: false,
  };
}

/**
 * Applies web-search provider selection to extensions manifest tool entries.
 */
export function applyWebSearchSelectionToManifest(
  args: {
    manifest: ExtensionManifest;
    provider: SetupWebSearchProvider;
  },
): ExtensionManifest {
  const toolsWithoutWebSearch = args.manifest.tools.filter((entry) => !isWebSearchToolEntry({ entry }));
  if (args.provider === 'none') {
    return {
      ...args.manifest,
      tools: toolsWithoutWebSearch,
    };
  }

  return {
    ...args.manifest,
    tools: [
      ...toolsWithoutWebSearch,
      {
        name: 'web-search',
        config: {
          provider: args.provider,
        },
      },
    ],
  };
}

/**
 * Returns true when one tool manifest entry points at web-search.
 */
export function isWebSearchToolEntry(
  args: {
    entry: ToolManifestEntry;
  },
): boolean {
  if (typeof args.entry === 'string') {
    return args.entry.trim() === 'web-search';
  }

  return args.entry.name.trim() === 'web-search';
}

/**
 * Builds setup env key/value assignments from selected options.
 */
export function buildSetupEnvValues(
  args: {
    options: SetupCommandOptions;
  },
): Record<string, string> {
  const values: Record<string, string> = {};
  const inferenceEnvKey = readProviderApiKeyEnvName({
    provider: args.options.provider,
  });
  if (args.options.inferenceApiKey) {
    values[inferenceEnvKey] = args.options.inferenceApiKey;
  }

  if (args.options.webSearchProvider === 'perplexity' && args.options.webSearchApiKey) {
    values[readWebSearchApiKeyEnvName({ provider: 'perplexity' })] = args.options.webSearchApiKey;
  }
  if (args.options.webSearchProvider === 'tavily' && args.options.webSearchApiKey) {
    values[readWebSearchApiKeyEnvName({ provider: 'tavily' })] = args.options.webSearchApiKey;
  }

  return values;
}

/**
 * Returns provider-specific inference api key env variable name.
 */
export function readProviderApiKeyEnvName(
  args: {
    provider: SetupCommandOptions['provider'];
  },
): string {
  if (args.provider === 'openai') {
    return 'OPENAI_API_KEY';
  }
  if (args.provider === 'anthropic') {
    return 'ANTHROPIC_API_KEY';
  }
  if (args.provider === 'gemini') {
    return 'GEMINI_API_KEY';
  }

  return 'GROK_API_KEY';
}

/**
 * Returns web-search provider-specific api key env variable name.
 */
export function readWebSearchApiKeyEnvName(
  args: {
    provider: Exclude<SetupWebSearchProvider, 'none'>;
  },
): string {
  return args.provider === 'perplexity'
    ? 'PERPLEXITY_API_KEY'
    : 'TAVILY_API_KEY';
}

/**
 * Writes merged env values into one dotenv file and returns written key names.
 */
export function writeSetupEnvFile(
  args: {
    filePath: string;
    values: Record<string, string>;
  },
): string[] {
  const existing = existsSync(args.filePath)
    ? parseDotEnvText({
      text: readFileSync(args.filePath, 'utf8'),
    })
    : {};
  const merged = {
    ...existing,
    ...args.values,
  };
  const keys = Object.keys(args.values);
  if (keys.length === 0) {
    return [];
  }

  mkdirSync(dirname(args.filePath), { recursive: true });
  writeFileSync(args.filePath, renderDotEnvText({ values: merged }));
  return keys.sort();
}

/**
 * Parses one dotenv text blob into key/value pairs.
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
 * Removes matching quotes around one dotenv value.
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
 * Renders one key/value map into dotenv text lines.
 */
export function renderDotEnvText(
  args: {
    values: Record<string, string>;
  },
): string {
  return Object.keys(args.values)
    .sort()
    .map((key) => `${key}=${args.values[key]}`)
    .join('\n')
    .concat('\n');
}

/**
 * Reads one JSON file from disk.
 */
export function readJsonFile(
  args: {
    filePath: string;
  },
): unknown {
  return JSON.parse(readFileSync(args.filePath, 'utf8'));
}

/**
 * Writes one JSON-serializable value to disk with stable formatting.
 */
export function writeJsonFile(
  args: {
    filePath: string;
    value: unknown;
  },
): void {
  mkdirSync(dirname(args.filePath), { recursive: true });
  writeFileSync(args.filePath, `${JSON.stringify(args.value, null, 2)}\n`);
}

/**
 * Runs one callback within a temporary working directory and restores previous cwd.
 */
export function runWithWorkingDirectory<Result>(
  args: {
    directoryPath: string;
    run: () => Result;
  },
): Result {
  const previousCwd = process.cwd();
  process.chdir(args.directoryPath);
  try {
    return args.run();
  } finally {
    process.chdir(previousCwd);
  }
}
