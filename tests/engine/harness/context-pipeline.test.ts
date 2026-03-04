import type { HarnessInput } from '@engine/harness/types';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildHarnessContextFromPipeline } from '@engine/harness/context/pipeline';
import { initializeDatabase } from '@engine/shared/database';

let tempRootPath = '';
let previousCwd = '';
let renderedSystemText = '';
let renderedInputText = '';
let renderedActiveMemory = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-context-pipeline-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  mkdirSync(join(tempRootPath, 'extensions', 'resolvers', 'demo-resolver'), { recursive: true });
  mkdirSync(join(tempRootPath, 'memory', 'persona-demo'), { recursive: true });

  writeFileSync(join(tempRootPath, 'config', 'snippet.md'), 'System section from file');
  writeFileSync(
    join(tempRootPath, 'config', 'context.json'),
    JSON.stringify({
      thread: [
        'file:config/snippet.md',
        'resolver:demo-resolver',
      ],
      responsibility: ['resolver:demo-resolver'],
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'extensions.json'),
    JSON.stringify({
      tools: [],
      hooks: [],
      resolvers: [
        {
          name: 'demo-resolver',
          config: {
            suffix: 'from-manifest',
          },
        },
      ],
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'resolvers', 'demo-resolver', 'config.json'),
    JSON.stringify({
      suffix: 'from-default',
    }),
  );
  writeFileSync(
    join(tempRootPath, 'extensions', 'resolvers', 'demo-resolver', 'index.js'),
    [
      'export const resolver = {',
      "  name: 'demo-resolver',",
      '  resolve: async ({ invocation, config }) => ({',
      '    sections: [`Resolver section ${config.suffix}`],',
      "    activeMemory: 'active from resolver',",
      '    inputText: String(invocation.context.input?.text ?? ""),',
      '  }),',
      '};',
    ].join('\n'),
  );

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
  db.close();
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness context pipeline', () => {
  it('merges file and resolver sections in configured order', () => {
    expect(renderedSystemText.includes('System section from file\n\nResolver section from-manifest')).toBe(true);
  });

  it('applies resolver input override to final input text', () => {
    expect(renderedInputText).toBe('latest input text');
  });

  it('applies resolver active-memory value to final context', () => {
    expect(renderedActiveMemory).toBe('active from resolver');
  });
});
