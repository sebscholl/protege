import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let previousCwd = '';
let tempRootPath = '';
let mergedProviderApiKeyEnv = '';
let personaDisplayName = '';
let personaEmailAddress = '';
let payloadFileExists = false;
let payloadFileContent = '';
let workspace = undefined as ReturnType<typeof createTestWorkspaceFromFixture> | undefined;

beforeAll((): void => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-workspace-helper-',
  });
  previousCwd = workspace.previousCwd;
  tempRootPath = workspace.tempRootPath;

  workspace.patchExtensionsManifest({
    providers: [
      {
        name: 'openai',
        config: {
          api_key_env: 'OPENAI_API_KEY',
        },
      },
    ],
  });
  workspace.patchPersona({
    personaId: 'persona-workspace-test',
    personaPatch: {
      personaId: 'persona-workspace-test',
      publicKeyBase32: 'fixture-persona',
      emailAddress: 'fixture-persona@localhost',
      displayName: 'Workspace Persona',
    },
  });
  workspace.writeFile({
    relativePath: 'tmp/workspace/payload.txt',
    payload: 'workspace payload',
  });

  const manifest = JSON.parse(
    readFileSync(join(tempRootPath, 'extensions', 'extensions.json'), 'utf8'),
  ) as {
    providers?: Array<{
      config?: {
        api_key_env?: string;
      };
    }>;
  };
  const persona = JSON.parse(
    readFileSync(join(tempRootPath, 'personas', 'persona-workspace-test', 'persona.json'), 'utf8'),
  ) as {
    displayName?: string;
    emailAddress?: string;
  };
  mergedProviderApiKeyEnv = manifest.providers?.[0]?.config?.api_key_env ?? '';
  personaDisplayName = persona.displayName ?? '';
  personaEmailAddress = persona.emailAddress ?? '';
  payloadFileExists = existsSync(join(tempRootPath, 'tmp', 'workspace', 'payload.txt'));
  payloadFileContent = readFileSync(join(tempRootPath, 'tmp', 'workspace', 'payload.txt'), 'utf8');
});

afterAll((): void => {
  workspace?.cleanup();
  process.chdir(previousCwd);
});

describe('test workspace helper', () => {
  it('patches extensions manifest using deep merge semantics', () => {
    expect(mergedProviderApiKeyEnv).toBe('OPENAI_API_KEY');
  });

  it('patches persona files under personas/{id}/persona.json', () => {
    expect(personaDisplayName).toBe('Workspace Persona');
  });

  it('preserves additional persona fields when persona patch is written', () => {
    expect(personaEmailAddress).toBe('fixture-persona@localhost');
  });

  it('writes arbitrary files relative to workspace root', () => {
    expect(payloadFileExists).toBe(true);
  });

  it('writes exact payload content through writeFile helper', () => {
    expect(payloadFileContent).toBe('workspace payload');
  });
});
