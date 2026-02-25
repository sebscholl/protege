import type { GatewayLogger } from '@engine/gateway/types';
import type { ProtegeDatabase } from '@engine/shared/database';
import type { SchedulerResponsibility } from '@engine/scheduler/storage';

import { createRequire } from 'node:module';

import { enqueueResponsibilityRunIfIdle, listEnabledResponsibilitiesByPersona } from '@engine/scheduler/storage';

/**
 * Represents one scheduled task handle returned by one cron provider.
 */
export type SchedulerCronTask = {
  stop: () => void;
  destroy?: () => void;
};

/**
 * Represents one cron schedule function used to register recurring callbacks.
 */
export type SchedulerCronScheduleFn = (
  args: {
    expression: string;
    onTick: () => void;
  },
) => SchedulerCronTask;

/**
 * Represents one cron expression validator.
 */
export type SchedulerCronValidateFn = (
  args: {
    expression: string;
  },
) => boolean;

/**
 * Represents one runtime cron controller for persona-scoped responsibilities.
 */
export type PersonaSchedulerCronController = {
  refresh: () => void;
  stop: () => void;
};

/**
 * Represents one runtime enqueue callback for responsibility ticks.
 */
export type ResponsibilityEnqueueFn = (
  args: {
    responsibility: SchedulerResponsibility;
    triggeredAt: string;
  },
) => {
  enqueued: boolean;
  runId?: string;
};

/**
 * Starts cron scheduling for one persona and enqueues run rows on matching ticks.
 */
export function startPersonaSchedulerCron(
  args: {
    db: ProtegeDatabase;
    personaId: string;
    logger?: GatewayLogger;
    scheduleFn?: SchedulerCronScheduleFn;
    validateFn?: SchedulerCronValidateFn;
    enqueueFn?: ResponsibilityEnqueueFn;
    now?: () => string;
  },
): PersonaSchedulerCronController {
  const scheduleFn = args.scheduleFn ?? loadNodeCronScheduleFn();
  const validateFn = args.validateFn ?? loadNodeCronValidateFn();
  const enqueueFn = args.enqueueFn ?? createDefaultEnqueueFn({
    db: args.db,
  });
  const now = args.now ?? (() : string => new Date().toISOString());
  let tasks: SchedulerCronTask[] = [];

  /**
   * Stops and clears all currently registered cron tasks.
   */
  function clearTasks(): void {
    for (const task of tasks) {
      task.stop();
      task.destroy?.();
    }
    tasks = [];
  }

  /**
   * Re-registers cron tasks from currently enabled responsibilities.
   */
  function refresh(): void {
    clearTasks();
    const responsibilities = listEnabledResponsibilitiesByPersona({
      db: args.db,
      personaId: args.personaId,
    });
    for (const responsibility of responsibilities) {
      if (!validateFn({ expression: responsibility.schedule })) {
        args.logger?.error({
          event: 'scheduler.cron.invalid_schedule',
          context: {
            personaId: args.personaId,
            responsibilityId: responsibility.id,
            schedule: responsibility.schedule,
          },
        });
        continue;
      }

      const task = scheduleFn({
        expression: responsibility.schedule,
        onTick: () => {
          const triggeredAt = now();
          const enqueueResult = enqueueFn({
            responsibility,
            triggeredAt,
          });
          if (enqueueResult.enqueued) {
            args.logger?.info({
              event: 'scheduler.cron.enqueued',
              context: {
                personaId: args.personaId,
                responsibilityId: responsibility.id,
                triggeredAt,
                runId: enqueueResult.runId ?? null,
              },
            });
          } else {
            args.logger?.info({
              event: 'scheduler.cron.skipped_overlap',
              context: {
                personaId: args.personaId,
                responsibilityId: responsibility.id,
                triggeredAt,
              },
            });
          }
        },
      });
      tasks.push(task);
    }
  }

  refresh();
  return {
    refresh,
    stop: clearTasks,
  };
}

/**
 * Creates the default run-enqueue behavior using scheduler storage.
 */
export function createDefaultEnqueueFn(
  args: {
    db: ProtegeDatabase;
  },
): ResponsibilityEnqueueFn {
  return (
    enqueueArgs: {
      responsibility: SchedulerResponsibility;
      triggeredAt: string;
    },
  ): { enqueued: boolean; runId?: string } => {
    return enqueueResponsibilityRunIfIdle({
      db: args.db,
      run: {
        responsibilityId: enqueueArgs.responsibility.id,
        personaId: enqueueArgs.responsibility.personaId,
        triggeredAt: enqueueArgs.triggeredAt,
        promptPathAtRun: enqueueArgs.responsibility.promptPath,
        promptHashAtRun: enqueueArgs.responsibility.promptHash,
      },
    });
  };
}

/**
 * Loads one node-cron schedule function using runtime require.
 */
export function loadNodeCronScheduleFn(): SchedulerCronScheduleFn {
  const nodeCron = loadNodeCronModule();
  return (
    args: {
      expression: string;
      onTick: () => void;
    },
  ): SchedulerCronTask => nodeCron.schedule(args.expression, args.onTick);
}

/**
 * Loads one node-cron validation function using runtime require.
 */
export function loadNodeCronValidateFn(): SchedulerCronValidateFn {
  const nodeCron = loadNodeCronModule();
  return (
    args: {
      expression: string;
    },
  ): boolean => Boolean(nodeCron.validate(args.expression));
}

/**
 * Loads node-cron module from runtime dependencies and throws actionable error when missing.
 */
export function loadNodeCronModule(): {
  schedule: (expression: string, onTick: () => void) => SchedulerCronTask;
  validate: (expression: string) => boolean;
} {
  const require = createRequire(import.meta.url);
  try {
    return require('node-cron') as {
      schedule: (expression: string, onTick: () => void) => SchedulerCronTask;
      validate: (expression: string) => boolean;
    };
  } catch {
    throw new Error('Scheduler requires "node-cron" runtime dependency.');
  }
}
