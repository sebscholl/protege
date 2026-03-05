import type { HarnessInput } from '@engine/harness/types';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildHarnessContextFromPipeline } from '@engine/harness/context/pipeline';
import { initializeDatabase } from '@engine/shared/database';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let previousCwd = '';
let renderedSystemText = '';
let renderedInputText = '';
let renderedActiveMemory = '';
let renderedTemplatedFileText = '';
let workspace = undefined as ReturnType<typeof createTestWorkspaceFromFixture> | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-context-pipeline-',
  });
  tempRootPath = workspace.tempRootPath;
  previousCwd = workspace.previousCwd;
  workspace.writeFile({
    relativePath: 'memory/persona-demo/active.md',
    payload: 'Active memory from template',
  });
  workspace.writeFile({
    relativePath: 'config/snippet.md',
    payload: 'System section from file',
  });
  workspace.patchConfigFiles({
    'context.json': {
      thread: [
        'load-file(config/snippet.md)',
        'load-file("memory/{ persona_id }/active.md")',
        'demo-resolver(foo, bar)',
      ],
      responsibility: ['demo-resolver(foo, bar)'],
    },
  });
  workspace.patchExtensionsManifest({
    tools: [],
    hooks: [],
    resolvers: [
      'load-file',
      {
        name: 'demo-resolver',
        config: {
          suffix: 'from-manifest',
        },
      },
    ],
  });
  workspace.writeFile({
    relativePath: 'extensions/resolvers/demo-resolver/config.json',
    payload: {
      suffix: 'from-default',
    },
  });
  workspace.writeFile({
    relativePath: 'extensions/resolvers/demo-resolver/index.js',
    payload: [
      'export const resolver = {',
      "  name: 'demo-resolver',",
      '  resolve: async ({ invocation, config, resolverArgs }) => ({',
      '    sections: [`Resolver section ${config.suffix} ${String(resolverArgs.join("|"))}`],',
      "    activeMemory: 'active from resolver',",
      '    inputText: `${String(invocation.context.input?.text ?? "")} ${String(invocation.context.personaId ?? "")}`.trim(),',
      '  }),',
      '};',
    ].join('\n'),
  });

  const db = initializeDatabase({
    databasePath: join(tempRootPath, 'memory', 'persona-demo', 'temporal.db'),
    migrationsDirPath: join(previousCwd, 'engine', 'shared', 'migrations'),
  });
  const input: HarnessInput = {
    source: 'email',
    threadId: 'thread-demo',
    messageId: '<demo@thread>',
    sender: 'sender@example.com',
    recipients: ['agent@example.com'],
    subject: 'Subject',
    text: 'latest input text',
    receivedAt: '2026-03-04T00:00:00.000Z',
    metadata: {},
  };

  const context = await buildHarnessContextFromPipeline({
    db,
    input,
    personaId: 'persona-demo',
    maxHistoryTokens: 1200,
    configPath: join(tempRootPath, 'config', 'context.json'),
    manifestPath: join(tempRootPath, 'extensions', 'extensions.json'),
  });

  renderedSystemText = (context.systemSections ?? []).join('\n\n');
  renderedInputText = context.input.text;
  renderedActiveMemory = context.activeMemory;
  renderedTemplatedFileText = String((context.systemSections ?? []).find((section) => section.includes('Active memory from template')) ?? '');
  db.close();
});

afterAll((): void => {
  workspace?.cleanup();
  process.chdir(previousCwd);
});

describe('harness context pipeline', () => {
  it('merges file and resolver sections in configured order', () => {
    expect(renderedSystemText.includes('System section from file\n\nActive memory from template\n\nResolver section from-manifest foo|bar')).toBe(true);
  });

  it('applies resolver input override to final input text', () => {
    expect(renderedInputText).toBe('latest input text persona-demo');
  });

  it('applies resolver active-memory value to final context', () => {
    expect(renderedActiveMemory).toBe('active from resolver');
  });

  it('resolves persona_id template tokens in load-file resolver args', () => {
    expect(renderedTemplatedFileText).toBe('Active memory from template');
  });
});
