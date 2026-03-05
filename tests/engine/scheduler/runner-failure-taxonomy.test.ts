import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initializeDatabase } from '@engine/shared/database';
import { createPersona } from '@engine/shared/personas';
import { runNextQueuedResponsibility } from '@engine/scheduler/runner';
import { enqueueResponsibilityRun, listResponsibilityRunsByPersona, upsertResponsibility } from '@engine/scheduler/storage';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let tempRootPath = '';
let roots: PersonaRoots | undefined;
let db: ProtegeDatabase | undefined;
let personaId = '';
let unknownFailureCategory = '';
let alertDispatchCount = 0;
let failedEventCount = 0;
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let repoRootPath = '';

/**
 * Creates one in-memory logger that tracks failed-run event emission.
 */
function createFailureEventLogger(): GatewayLogger {
  return {
    info: (): void => undefined,
    error: (
      args: {
        event: string;
      },
    ): void => {
      if (args.event === 'scheduler.run.failed') {
        failedEventCount += 1;
      }
    },
  };
}

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-scheduler-runner-failure-taxonomy-',
  });
  repoRootPath = workspace.previousCwd;
  tempRootPath = workspace.tempRootPath;
  roots = {
    personasDirPath: join(tempRootPath, 'personas'),
    memoryDirPath: join(tempRootPath, 'memory'),
  };
  const persona = createPersona({
    roots,
  });
  personaId = persona.personaId;
  const promptPath = join(roots.personasDirPath, personaId, 'responsibilities', 'unknown-failure.md');
  workspace.writeFile({
    relativePath: join('personas', personaId, 'responsibilities', 'unknown-failure.md'),
    payload: [
    '---',
    'name: Unknown Failure Task',
    'schedule: */5 * * * *',
    'enabled: true',
    '---',
    'Fail with a non-Error throw.',
  ].join('\n'),
  });

  db = initializeDatabase({
    databasePath: join(tempRootPath, 'temporal.db'),
    migrationsDirPath: join(repoRootPath, 'engine', 'shared', 'migrations'),
  });

  upsertResponsibility({
    db: db as ProtegeDatabase,
    responsibility: {
      id: 'resp-unknown-failure',
      personaId,
      name: 'Unknown Failure Task',
      schedule: '*/5 * * * *',
      promptPath,
      promptHash: 'hash-unknown-failure',
      enabled: true,
    },
  });
  enqueueResponsibilityRun({
    db: db as ProtegeDatabase,
    run: {
      responsibilityId: 'resp-unknown-failure',
      personaId,
      triggeredAt: '2026-02-27T00:01:00.000Z',
    },
    runId: 'run-unknown-failure',
  });
  await runNextQueuedResponsibility({
    db: db as ProtegeDatabase,
    roots,
    logger: createFailureEventLogger(),
    executeRun: async (): Promise<never> => {
      throw 'non-error-throw';
    },
    sendFailureAlert: async (): Promise<void> => {
      alertDispatchCount += 1;
    },
  });
  unknownFailureCategory = listResponsibilityRunsByPersona({
    db: db as ProtegeDatabase,
    personaId,
  }).find((run) => run.id === 'run-unknown-failure')?.failureCategory ?? '';
});

afterAll((): void => {
  db?.close();
  workspace.cleanup();
});

describe('scheduler runner failure taxonomy', () => {
  it('categorizes non-Error terminal failures as unknown', () => {
    expect(unknownFailureCategory).toBe('unknown');
  });

  it('dispatches exactly one failure alert per failed run', () => {
    expect(alertDispatchCount).toBe(1);
  });

  it('emits scheduler.run.failed events for all terminal failure categories', () => {
    expect(failedEventCount).toBe(1);
  });
});
