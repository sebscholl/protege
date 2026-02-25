import type { Transporter } from 'nodemailer';

import type { RelayClientController } from '@engine/gateway/relay-client';
import type { GatewayLogger, InboundNormalizedMessage } from '@engine/gateway/types';
import type { HarnessRuntimeActionInvoker } from '@engine/harness/runtime';
import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';

import { setInterval } from 'node:timers';

import { createGatewayRuntimeActionInvoker } from '@engine/gateway/index';
import { createOutboundTransport } from '@engine/gateway/outbound';
import { createUnifiedLogger } from '@engine/shared/logger';
import { initializeDatabase } from '@engine/shared/database';
import { listPersonas, readPersonaMetadata, resolvePersonaMemoryPaths } from '@engine/shared/personas';
import { readGlobalRuntimeConfig } from '@engine/shared/runtime-config';
import { startPersonaSchedulerCron } from '@engine/scheduler/cron';
import { runNextQueuedResponsibility } from '@engine/scheduler/runner';
import { syncPersonaResponsibilities } from '@engine/scheduler/sync';
import { resolveMigrationsDirPath } from '@engine/harness/runtime';

/**
 * Represents one global scheduler runtime start configuration.
 */
export type SchedulerRuntimeConfig = {
  roots?: PersonaRoots;
  personaIds?: string[];
  pollIntervalMs?: number;
  ownerAlertAddress?: string;
};

/**
 * Represents one running scheduler controller lifecycle.
 */
export type SchedulerRuntimeController = {
  stop: () => void;
};

/**
 * Represents one scheduler persona-scoped runtime state held by global runtime.
 */
export type SchedulerPersonaState = {
  personaId: string;
  db: ProtegeDatabase;
  cronController: ReturnType<typeof startPersonaSchedulerCron>;
};

/**
 * Represents one optional scheduler runtime dependency override surface.
 */
export type SchedulerRuntimeDependencies = {
  logger?: GatewayLogger;
  transport?: Transporter;
  relayClientsByPersonaId?: Map<string, RelayClientController>;
};

const DEFAULT_SCHEDULER_POLL_INTERVAL_MS = 1000;

/**
 * Starts global scheduler runtime for all selected personas without owning network connections.
 */
export function startSchedulerRuntime(
  args: {
    config: SchedulerRuntimeConfig;
    dependencies?: SchedulerRuntimeDependencies;
  },
): SchedulerRuntimeController {
  const logger = args.dependencies?.logger ?? createSchedulerLogger();
  const transport = args.dependencies?.transport;
  const relayClientsByPersonaId = args.dependencies?.relayClientsByPersonaId;
  const personaIds = resolveSchedulerPersonaIds({
    explicitPersonaIds: args.config.personaIds,
    roots: args.config.roots,
  });
  const personaStates = personaIds.map((personaId) => createSchedulerPersonaState({
    personaId,
    roots: args.config.roots,
    logger,
  }));
  const pollIntervalMs = args.config.pollIntervalMs ?? DEFAULT_SCHEDULER_POLL_INTERVAL_MS;
  let disposed = false;
  let processing = false;
  const timer = setInterval(() => {
    if (disposed || processing) {
      return;
    }

    processing = true;
    void runSchedulerCycle({
      personaStates,
      roots: args.config.roots,
      logger,
      transport,
      relayClientsByPersonaId,
      ownerAlertAddress: args.config.ownerAlertAddress,
    }).finally(() => {
      processing = false;
    });
  }, pollIntervalMs);

  return {
    stop: (): void => {
      disposed = true;
      clearInterval(timer);
      stopSchedulerPersonaStates({
        personaStates,
      });
      logger.info({
        event: 'scheduler.stopped',
        context: {
          personaCount: personaStates.length,
        },
      });
    },
  };
}

/**
 * Runs one scheduler cycle across all persona states without allowing one failure to break the loop.
 */
export async function runSchedulerCycle(
  args: {
    personaStates: SchedulerPersonaState[];
    roots?: PersonaRoots;
    logger: GatewayLogger;
    transport?: Transporter;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    ownerAlertAddress?: string;
  },
): Promise<void> {
  for (const personaState of args.personaStates) {
    try {
      await runNextQueuedResponsibility({
        db: personaState.db,
        personaId: personaState.personaId,
        roots: args.roots,
        logger: args.logger,
        createRuntimeActionInvoker: (
          invokerArgs: {
            message: InboundNormalizedMessage;
          },
        ): HarnessRuntimeActionInvoker => createGatewayRuntimeActionInvoker({
          message: invokerArgs.message,
          logger: args.logger,
          transport: args.transport,
          relayClientsByPersonaId: args.relayClientsByPersonaId,
          correlationId: `scheduler:${invokerArgs.message.threadId}`,
        }),
        sendFailureAlert: async (
          failureArgs: {
            run: {
              id: string;
              responsibilityId: string;
            };
            responsibility?: {
              name: string;
              personaId: string;
            };
            errorMessage: string;
          },
        ): Promise<void> => {
          const failurePersonaId = failureArgs.responsibility?.personaId ?? personaState.personaId;
          await sendSchedulerFailureAlert({
            logger: args.logger,
            transport: args.transport,
            relayClientsByPersonaId: args.relayClientsByPersonaId,
            ownerAlertAddress: args.ownerAlertAddress,
            personaId: failurePersonaId,
            runId: failureArgs.run.id,
            responsibilityId: failureArgs.run.responsibilityId,
            responsibilityName: failureArgs.responsibility?.name ?? 'unknown',
            errorMessage: failureArgs.errorMessage,
            roots: args.roots,
          });
        },
      });
    } catch (error) {
      args.logger.error({
        event: 'scheduler.cycle.persona_failed',
        context: {
          personaId: personaState.personaId,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

/**
 * Creates one scheduler persona runtime state with DB, sync, and cron registration.
 */
export function createSchedulerPersonaState(
  args: {
    personaId: string;
    roots?: PersonaRoots;
    logger: GatewayLogger;
  },
): SchedulerPersonaState {
  const personaMemoryPaths = resolvePersonaMemoryPaths({
    personaId: args.personaId,
    roots: args.roots,
  });
  const db = initializeDatabase({
    databasePath: personaMemoryPaths.temporalDbPath,
    migrationsDirPath: resolveMigrationsDirPath(),
  });
  const syncResult = syncPersonaResponsibilities({
    db,
    personaId: args.personaId,
    roots: args.roots,
  });
  args.logger.info({
    event: 'scheduler.sync.completed',
    context: {
      personaId: args.personaId,
      upsertedCount: syncResult.upsertedCount,
      disabledCount: syncResult.disabledCount,
    },
  });
  const cronController = startPersonaSchedulerCron({
    db,
    personaId: args.personaId,
    logger: args.logger,
  });
  return {
    personaId: args.personaId,
    db,
    cronController,
  };
}

/**
 * Stops cron/DB resources for all scheduler persona states.
 */
export function stopSchedulerPersonaStates(
  args: {
    personaStates: SchedulerPersonaState[];
  },
): void {
  for (const personaState of args.personaStates) {
    personaState.cronController.stop();
    personaState.db.close();
  }
}

/**
 * Resolves scheduler persona IDs from explicit list or all known personas.
 */
export function resolveSchedulerPersonaIds(
  args: {
    explicitPersonaIds?: string[];
    roots?: PersonaRoots;
  },
): string[] {
  if (args.explicitPersonaIds && args.explicitPersonaIds.length > 0) {
    return [...new Set(args.explicitPersonaIds)];
  }

  return listPersonas({
    roots: args.roots,
  }).map((persona) => persona.personaId);
}

/**
 * Creates one default scheduler logger from global runtime config.
 */
export function createSchedulerLogger(): GatewayLogger {
  const globalConfig = readGlobalRuntimeConfig();
  return createUnifiedLogger({
    logsDirPath: globalConfig.logsDirPath,
    scope: 'scheduler',
    consoleLogFormat: globalConfig.consoleLogFormat,
  });
}

/**
 * Sends one scheduler failure alert email via configured gateway runtime action channels.
 */
export async function sendSchedulerFailureAlert(
  args: {
    logger: GatewayLogger;
    transport?: Transporter;
    relayClientsByPersonaId?: Map<string, RelayClientController>;
    ownerAlertAddress?: string;
    personaId: string;
    runId: string;
    responsibilityId: string;
    responsibilityName: string;
    errorMessage: string;
    roots?: PersonaRoots;
  },
): Promise<void> {
  const alertMessage = buildSchedulerFailureAlertInboundMessage({
    personaId: args.personaId,
    runId: args.runId,
    responsibilityId: args.responsibilityId,
    responsibilityName: args.responsibilityName,
    errorMessage: args.errorMessage,
    roots: args.roots,
  });
  const invokeRuntimeAction = createGatewayRuntimeActionInvoker({
    message: alertMessage,
    logger: args.logger,
    transport: args.transport,
    relayClientsByPersonaId: args.relayClientsByPersonaId,
    correlationId: `scheduler-alert:${args.runId}`,
  });
  await invokeRuntimeAction({
    action: 'email.send',
    payload: {
      to: [args.ownerAlertAddress ?? alertMessage.from[0].address],
      subject: alertMessage.subject,
      text: alertMessage.text,
      threadingMode: 'new_thread',
    },
  });
}

/**
 * Builds one synthetic inbound message for scheduler failure alert dispatch with persona sender identity.
 */
export function buildSchedulerFailureAlertInboundMessage(
  args: {
    personaId: string;
    runId: string;
    responsibilityId: string;
    responsibilityName: string;
    errorMessage: string;
    roots?: PersonaRoots;
  },
): InboundNormalizedMessage {
  const persona = readPersonaMetadata({
    personaId: args.personaId,
    roots: args.roots,
  });
  const personaMailboxIdentity = persona.emailAddress;
  return {
    personaId: args.personaId,
    messageId: `<scheduler.alert.${Date.now()}@localhost>`,
    threadId: `scheduler-alert-${args.runId}`,
    from: [{ address: 'scheduler@localhost' }],
    to: [{ address: personaMailboxIdentity }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: personaMailboxIdentity }],
    subject: `Scheduler failure: ${args.responsibilityName}`,
    text: [
      'A scheduled responsibility run failed.',
      `run_id: ${args.runId}`,
      `responsibility_id: ${args.responsibilityId}`,
      `responsibility_name: ${args.responsibilityName}`,
      `error: ${args.errorMessage}`,
    ].join('\n'),
    references: [],
    receivedAt: new Date().toISOString(),
    rawMimePath: '__scheduler_alert__',
    attachments: [],
  };
}

/**
 * Creates one SMTP transport for scheduler runtime tests that need direct transport invocation.
 */
export function createSchedulerTransport(
  args: {
    config: {
      host: string;
      port: number;
      secure: boolean;
      auth?: {
        user: string;
        pass: string;
      };
    };
  },
): Transporter {
  return createOutboundTransport({
    config: args.config,
  });
}
