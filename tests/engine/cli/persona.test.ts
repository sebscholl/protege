import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let createdPersonaId = '';
let listedPersonasLength = 0;
let personaInfoId = '';
let personaDeleted = false;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-persona-',
  });

  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const outputs: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    outputs.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  await runCli({ argv: ['persona', 'create', '--name', 'Primary', '--json'] });
  const created = JSON.parse(outputs.pop() ?? '{}') as { personaId: string };
  createdPersonaId = created.personaId;

  await runCli({ argv: ['persona', 'list', '--json'] });
  const listed = JSON.parse(outputs.pop() ?? '[]') as Array<{ personaId: string }>;
  listedPersonasLength = listed.length;

  await runCli({ argv: ['persona', 'info', createdPersonaId, '--json'] });
  const info = JSON.parse(outputs.pop() ?? '{}') as { personaId: string };
  personaInfoId = info.personaId;

  await runCli({ argv: ['persona', 'delete', createdPersonaId, '--json'] });
  void outputs.pop();
  personaDeleted = !existsSync(join(workspace.tempRootPath, 'personas', createdPersonaId));

  process.stdout.write = stdoutWrite;
});

afterAll((): void => {
  workspace.cleanup();
});

describe('persona cli commands', () => {
  it('creates one persona and returns persona metadata json', () => {
    expect(createdPersonaId.length).toBe(16);
  });

  it('lists personas after creation', () => {
    expect(listedPersonasLength).toBe(1);
  });

  it('returns info for a specific persona id', () => {
    expect(personaInfoId).toBe(createdPersonaId);
  });

  it('hard deletes persona config namespace on delete', () => {
    expect(personaDeleted).toBe(true);
  });
});
