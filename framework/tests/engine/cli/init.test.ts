import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { captureStdout } from '@tests/helpers/stdout';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let projectPath = '';
let firstCreatedCount = 0;
let secondSkippedCount = 0;
let forceCreatedCount = 0;
let resetCreatedCount = 0;
let gatewayConfigExists = false;
let securityConfigExists = false;
let toolsReadmeExists = false;
let threadMemoryHookExists = false;
let personaTemplateExists = true;
let personaTemplateKnowledgeIndexExists = true;
let inferenceLocalExampleExists = false;
let initializedInferenceHasNoProvidersBlock = false;
let initializedExtensionsIncludesOpenAiProvider = false;
let initializedAdminContactEmailBlank = false;
let sentinelPreserved = false;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-init-',
  });
  projectPath = join(workspace.tempRootPath, 'sample-project');

  const firstResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath, '--json'],
    }),
  })).trim()) as {
    createdFiles: string[];
  };
  firstCreatedCount = firstResult.createdFiles.length;
  gatewayConfigExists = existsSync(join(projectPath, 'configs', 'gateway.json'));
  securityConfigExists = existsSync(join(projectPath, 'configs', 'security.json'));
  toolsReadmeExists = existsSync(join(projectPath, 'extensions', 'tools', 'README.md'));
  threadMemoryHookExists = existsSync(join(projectPath, 'extensions', 'hooks', 'thread-memory-updater', 'index.ts'));
  personaTemplateExists = existsSync(join(projectPath, 'templates', 'persona', 'PERSONA.md'));
  personaTemplateKnowledgeIndexExists = existsSync(join(projectPath, 'templates', 'persona', 'knowledge', 'CONTENT.md'));
  inferenceLocalExampleExists = existsSync(join(projectPath, 'configs', 'inference.local.example.json'));
  const inferenceJson = JSON.parse(readFileSync(join(projectPath, 'configs', 'inference.json'), 'utf8')) as {
    providers?: unknown;
  };
  initializedInferenceHasNoProvidersBlock = inferenceJson.providers === undefined;
  const extensionsManifest = JSON.parse(readFileSync(join(projectPath, 'extensions', 'extensions.json'), 'utf8')) as {
    providers?: Array<string | {
      name?: string;
      config?: {
        api_key_env?: string;
      };
    }>;
  };
  initializedExtensionsIncludesOpenAiProvider = extensionsManifest.providers?.some((entry) => {
    if (typeof entry === 'string') {
      return entry === 'openai';
    }

    return entry.name === 'openai';
  }) ?? false;
  const systemJson = JSON.parse(readFileSync(join(projectPath, 'configs', 'system.json'), 'utf8')) as {
    admin_contact_email?: unknown;
  };
  initializedAdminContactEmailBlank = systemJson.admin_contact_email === '';

  const sentinelPath = join(projectPath, 'configs', 'gateway.json');
  const sentinelValue = '{"sentinel":"keep"}\n';
  writeFileSync(sentinelPath, sentinelValue);

  const secondResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath, '--json'],
    }),
  })).trim()) as {
    skippedFiles: string[];
  };
  secondSkippedCount = secondResult.skippedFiles.length;
  sentinelPreserved = readFileSync(sentinelPath, 'utf8') === sentinelValue;

  const forceResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath, '--force', '--json'],
    }),
  })).trim()) as {
    createdFiles: string[];
  };
  forceCreatedCount = forceResult.createdFiles.length;

  const resetResult = JSON.parse((await captureStdout({
    run: async (): Promise<void> => runCli({
      argv: ['init', '--path', projectPath, '--reset', '--json'],
    }),
  })).trim()) as {
    createdFiles: string[];
  };
  resetCreatedCount = resetResult.createdFiles.length;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('init cli command', () => {
  it('creates scaffold files on first run', () => {
    expect(firstCreatedCount > 5).toBe(true);
  });

  it('writes gateway config scaffold into target path', () => {
    expect(gatewayConfigExists).toBe(true);
  });

  it('writes security config scaffold into target path', () => {
    expect(securityConfigExists).toBe(true);
  });

  it('writes extensions tools directory readme scaffold into target path', () => {
    expect(toolsReadmeExists).toBe(true);
  });

  it('writes default thread-memory hook scaffold into target path', () => {
    expect(threadMemoryHookExists).toBe(true);
  });

  it('does not scaffold internal persona templates into target path', () => {
    expect(personaTemplateExists).toBe(false);
  });

  it('does not scaffold internal persona knowledge template index into target path', () => {
    expect(personaTemplateKnowledgeIndexExists).toBe(false);
  });

  it('does not scaffold inference.local example config files', () => {
    expect(inferenceLocalExampleExists).toBe(false);
  });

  it('does not scaffold provider credentials in inference config', () => {
    expect(initializedInferenceHasNoProvidersBlock).toBe(true);
  });

  it('scaffolds openai provider in extensions manifest', () => {
    expect(initializedExtensionsIncludesOpenAiProvider).toBe(true);
  });

  it('scaffolds blank admin contact email by default', () => {
    expect(initializedAdminContactEmailBlank).toBe(true);
  });

  it('skips existing files when --force is omitted', () => {
    expect(secondSkippedCount > 0).toBe(true);
  });

  it('preserves existing files when --force is omitted', () => {
    expect(sentinelPreserved).toBe(true);
  });

  it('recreates scaffold files when --force is used', () => {
    expect(forceCreatedCount > 5).toBe(true);
  });

  it('recreates scaffold files when --reset is used', () => {
    expect(resetCreatedCount > 5).toBe(true);
  });
});
