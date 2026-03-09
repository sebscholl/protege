import type { TestWorkspace } from '@tests/helpers/workspace';

/**
 * Represents one provider scaffold result with deterministic env cleanup.
 */
export type ProviderScaffoldResult = {
  restoreEnv: () => void;
};

/**
 * Scaffolds one provider config file, manifest provider entry, and env var binding for tests.
 */
export function scaffoldProviderConfig(
  args: {
    workspace: TestWorkspace;
    providerName: string;
    apiKeyEnv: string;
    apiKeyValue: string;
    manifestConfig?: Record<string, unknown>;
    providerConfig?: Record<string, unknown>;
    patchExtensionsManifest?: boolean;
    writeProviderConfig?: boolean;
  },
): ProviderScaffoldResult {
  const priorValue = process.env[args.apiKeyEnv];
  process.env[args.apiKeyEnv] = args.apiKeyValue;

  if (args.patchExtensionsManifest !== false) {
    args.workspace.patchExtensionsManifest({
      providers: [
        {
          name: args.providerName,
          config: {
            api_key_env: args.apiKeyEnv,
            ...(args.manifestConfig ?? {}),
          },
        },
      ],
    });
  }

  if (args.writeProviderConfig !== false) {
    args.workspace.writeFile({
      relativePath: `extensions/providers/${args.providerName}/config.json`,
      payload: {
        api_key_env: args.apiKeyEnv,
        ...(args.providerConfig ?? {}),
      },
    });
  }

  return {
    restoreEnv: (): void => {
      if (priorValue === undefined) {
        delete process.env[args.apiKeyEnv];
        return;
      }

      process.env[args.apiKeyEnv] = priorValue;
    },
  };
}
