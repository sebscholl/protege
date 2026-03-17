import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import {
  hasSetupConfigFlags,
  parseSetupArgs,
  readProviderApiKeyEnvName,
  readSetupNextCommand,
  runSetupCommand,
  validateEmailAddress,
  validateRelayWsUrl,
} from '@engine/cli/setup';
import { listPersonas } from '@engine/shared/personas';
import { captureStdout } from '@tests/helpers/stdout';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let setupResult = {} as {
  personaId: string;
  provider: string;
  outboundMode: string;
  relayWsUrl?: string;
  mailDomain: string;
  personaEmailAddress: string;
  createdPersona: boolean;
  webSearchProvider: string;
  wroteEnvKeys: string[];
};
let inferenceProvider = '';
let gatewayRelayEnabled = false;
let gatewayRelayWsUrl = '';
let gatewayTransportDefined = true;
let systemAdminContactEmail = '';
let webSearchToolConfigProvider = '';
let anthropicEnvPresent = false;
let tavilyEnvPresent = false;
let personaCount = 0;
let personaKnowledgeReadmeExists = false;
let personaResponsibilitiesReadmeExists = false;
let rerunProvider = '';
let rerunOutboundMode = '';
let rerunWebSearchProvider = '';
let rerunAdminContactEmail = '';
let rerunNextCommand = '';
let parsedOpenRouterProvider = '';
let openRouterEnvName = '';

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-setup-',
  });

  const output = await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: [
        'setup',
        '--path',
        join(workspace.tempRootPath, 'sample-project'),
        '--provider',
        'anthropic',
        '--inference-api-key',
        'anthropic-key-123',
        '--outbound',
        'relay',
        '--relay-ws-url',
        'wss://relay.protege.bot/ws',
        '--web-search-provider',
        'tavily',
        '--web-search-api-key',
        'tavily-key-123',
        '--admin-contact-email',
        'ops@example.com',
        '--json',
      ],
    }),
  });

  setupResult = JSON.parse(output.trim()) as typeof setupResult;

  const projectPath = join(workspace.tempRootPath, 'sample-project');
  const inferenceConfig = JSON.parse(readFileSync(join(projectPath, 'configs', 'inference.json'), 'utf8')) as {
    provider: string;
  };
  inferenceProvider = inferenceConfig.provider;

  const gatewayConfig = JSON.parse(readFileSync(join(projectPath, 'configs', 'gateway.json'), 'utf8')) as {
    relay?: {
      enabled?: boolean;
      relayWsUrl?: string;
    };
    transport?: {
      host: string;
      port: number;
      secure: boolean;
    };
  };
  gatewayRelayEnabled = gatewayConfig.relay?.enabled === true;
  gatewayRelayWsUrl = gatewayConfig.relay?.relayWsUrl ?? '';
  gatewayTransportDefined = gatewayConfig.transport !== undefined;

  const systemConfig = JSON.parse(readFileSync(join(projectPath, 'configs', 'system.json'), 'utf8')) as {
    admin_contact_email?: string;
  };
  systemAdminContactEmail = systemConfig.admin_contact_email ?? '';

  const extensionsManifest = JSON.parse(readFileSync(join(projectPath, 'extensions', 'extensions.json'), 'utf8')) as {
    tools: Array<string | {
      name: string;
      config?: {
        provider?: string;
      };
    }>;
  };
  const webSearchEntry = extensionsManifest.tools.find((toolEntry) => {
    if (typeof toolEntry === 'string') {
      return toolEntry === 'web-search';
    }

    return toolEntry.name === 'web-search';
  });
  webSearchToolConfigProvider = typeof webSearchEntry === 'object'
    ? webSearchEntry.config?.provider ?? ''
    : '';

  const envText = readFileSync(join(projectPath, '.secrets'), 'utf8');
  anthropicEnvPresent = envText.includes('ANTHROPIC_API_KEY=anthropic-key-123');
  tavilyEnvPresent = envText.includes('TAVILY_API_KEY=tavily-key-123');

  personaCount = listPersonas({
    roots: {
      personasDirPath: join(projectPath, 'personas'),
      memoryDirPath: join(projectPath, 'memory'),
    },
  }).length;
  personaKnowledgeReadmeExists = existsSync(join(
    projectPath,
    'personas',
    setupResult.personaId,
    'knowledge',
    'README.md',
  ));
  personaResponsibilitiesReadmeExists = existsSync(join(
    projectPath,
    'personas',
    setupResult.personaId,
    'responsibilities',
    'README.md',
  ));

  const rerunResult = await runSetupCommand({
    argv: [
      '--path',
      projectPath,
      '--non-interactive',
    ],
  });
  rerunProvider = rerunResult.provider;
  rerunOutboundMode = rerunResult.outboundMode;
  rerunWebSearchProvider = rerunResult.webSearchProvider;
  rerunNextCommand = rerunResult.nextCommand;
  const rerunSystemConfig = JSON.parse(readFileSync(join(projectPath, 'configs', 'system.json'), 'utf8')) as {
    admin_contact_email?: string;
  };
  rerunAdminContactEmail = rerunSystemConfig.admin_contact_email ?? '';
  parsedOpenRouterProvider = parseSetupArgs({
    argv: ['--provider', 'openrouter', '--non-interactive'],
  }).options.provider;
  openRouterEnvName = readProviderApiKeyEnvName({
    provider: 'openrouter',
  });
});

afterAll((): void => {
  workspace.cleanup();
});

describe('setup cli command', () => {
  it('rejects unknown setup flags', async () => {
    await expect(runCli({ argv: ['setup', '--wat'] })).rejects.toThrow('Unknown setup option');
  });

  it('returns configured provider and outbound mode in setup result payload', () => {
    expect([setupResult.provider, setupResult.outboundMode]).toEqual(['anthropic', 'relay']);
  });

  it('returns configured relay ws url in setup result payload', () => {
    expect(setupResult.relayWsUrl).toBe('wss://relay.protege.bot/ws');
  });

  it('returns inferred relay mail domain in setup result payload', () => {
    expect(setupResult.mailDomain).toBe('mail.protege.bot');
  });

  it('returns persona mailbox address in setup result payload', () => {
    expect(setupResult.personaEmailAddress.endsWith('@mail.protege.bot')).toBe(true);
  });

  it('writes selected inference provider into inference config', () => {
    expect(inferenceProvider).toBe('anthropic');
  });

  it('enables relay outbound mode in gateway config', () => {
    expect(gatewayRelayEnabled).toBe(true);
  });

  it('writes configured relay ws url into gateway config', () => {
    expect(gatewayRelayWsUrl).toBe('wss://relay.protege.bot/ws');
  });

  it('removes local smtp transport config when relay mode is selected', () => {
    expect(gatewayTransportDefined).toBe(false);
  });

  it('writes configured admin contact email into system config', () => {
    expect(systemAdminContactEmail).toBe('ops@example.com');
  });

  it('writes web-search provider override as manifest object config', () => {
    expect(webSearchToolConfigProvider).toBe('tavily');
  });

  it('writes inference api key into target project env file', () => {
    expect(anthropicEnvPresent).toBe(true);
  });

  it('writes web-search api key into target project env file', () => {
    expect(tavilyEnvPresent).toBe(true);
  });

  it('creates one bootstrap persona during setup flow', () => {
    expect(personaCount).toBe(1);
  });

  it('creates bootstrap persona knowledge directory readme during setup flow', () => {
    expect(personaKnowledgeReadmeExists).toBe(true);
  });

  it('creates bootstrap persona responsibilities directory readme during setup flow', () => {
    expect(personaResponsibilitiesReadmeExists).toBe(true);
  });

  it('writes .secrets file into target project path', () => {
    expect(existsSync(join(workspace.tempRootPath, 'sample-project', '.secrets'))).toBe(true);
  });

  it('preserves provider selection on non-interactive rerun without flags', () => {
    expect(rerunProvider).toBe('anthropic');
  });

  it('preserves outbound mode selection on non-interactive rerun without flags', () => {
    expect(rerunOutboundMode).toBe('relay');
  });

  it('preserves web-search provider on non-interactive rerun without flags', () => {
    expect(rerunWebSearchProvider).toBe('tavily');
  });

  it('preserves admin contact email on non-interactive rerun without flags', () => {
    expect(rerunAdminContactEmail).toBe('ops@example.com');
  });

  it('returns deterministic next command when doctor is not requested', () => {
    expect(rerunNextCommand).toBe('protege doctor && protege gateway start');
  });

  it('parses openrouter as a valid setup provider', () => {
    expect(parsedOpenRouterProvider).toBe('openrouter');
  });

  it('maps openrouter setup credentials to OPENROUTER_API_KEY', () => {
    expect(openRouterEnvName).toBe('OPENROUTER_API_KEY');
  });
});

let localSetupResult = {} as {
  outboundMode: string;
  relayWsUrl?: string;
  webSearchProvider: string;
};
let localGatewayRelayEnabled = true;
let localGatewayTransportHost = '';
let localGatewayTransportPort = -1;
let localWebSearchEntryExists = true;

beforeAll(async (): Promise<void> => {
  const localProjectPath = join(workspace.tempRootPath, 'sample-local-project');
  const output = await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: [
        'setup',
        '--path',
        localProjectPath,
        '--outbound',
        'local',
        '--web-search-provider',
        'none',
        '--json',
      ],
    }),
  });
  localSetupResult = JSON.parse(output.trim()) as typeof localSetupResult;

  const gatewayConfig = JSON.parse(readFileSync(join(localProjectPath, 'configs', 'gateway.json'), 'utf8')) as {
    relay?: {
      enabled?: boolean;
    };
    transport?: {
      host?: string;
      port?: number;
    };
  };
  localGatewayRelayEnabled = gatewayConfig.relay?.enabled === true;
  localGatewayTransportHost = gatewayConfig.transport?.host ?? '';
  localGatewayTransportPort = gatewayConfig.transport?.port ?? -1;

  const extensionsManifest = JSON.parse(readFileSync(join(localProjectPath, 'extensions', 'extensions.json'), 'utf8')) as {
    tools: Array<string | {
      name: string;
    }>;
  };
  localWebSearchEntryExists = extensionsManifest.tools.some((toolEntry) => {
    if (typeof toolEntry === 'string') {
      return toolEntry === 'web-search';
    }

    return toolEntry.name === 'web-search';
  });
});

describe('setup cli local mode and optional tool behavior', () => {
  it('returns local outbound mode in setup result payload', () => {
    expect(localSetupResult.outboundMode).toBe('local');
  });

  it('does not return relay ws url for local outbound mode', () => {
    expect(localSetupResult.relayWsUrl).toBe(undefined);
  });

  it('disables relay in gateway config when local outbound is selected', () => {
    expect(localGatewayRelayEnabled).toBe(false);
  });

  it('keeps local smtp transport configured in local outbound mode', () => {
    expect([localGatewayTransportHost, localGatewayTransportPort]).toEqual(['127.0.0.1', 1025]);
  });

  it('removes web-search tool entry when provider is none', () => {
    expect(localWebSearchEntryExists).toBe(false);
  });
});

describe('setup arg parsing behavior', () => {
  it('detects explicit setup config flags', () => {
    expect(hasSetupConfigFlags({ argv: ['--provider', 'openai'] })).toBe(true);
  });

  it('does not treat path and force as setup config flags', () => {
    expect(hasSetupConfigFlags({ argv: ['--path', '/tmp/x', '--force'] })).toBe(false);
  });

  it('does not treat path and reset as setup config flags', () => {
    expect(hasSetupConfigFlags({ argv: ['--path', '/tmp/x', '--reset'] })).toBe(false);
  });

  it('marks parse as non-interactive when --non-interactive is set', () => {
    expect(parseSetupArgs({ argv: ['--non-interactive'] }).interactive).toBe(false);
  });

  it('maps --reset to force scaffold overwrite behavior', () => {
    expect(parseSetupArgs({ argv: ['--reset'] }).options.force).toBe(true);
  });
});

describe('setup option validation', () => {
  it('rejects invalid relay websocket urls', () => {
    expect(() => validateRelayWsUrl({ relayWsUrl: 'https://relay.protege.bot/ws' })).toThrow('Invalid --relay-ws-url value');
  });

  it('rejects invalid admin email values', () => {
    expect(() => validateEmailAddress({ emailAddress: 'ops_at_example.com', label: '--admin-contact-email' })).toThrow('Invalid --admin-contact-email value');
  });

  it('returns gateway start next command when doctor has already run', () => {
    expect(readSetupNextCommand({ runDoctor: true })).toBe('protege gateway start');
  });
});
