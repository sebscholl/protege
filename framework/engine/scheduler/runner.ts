import type { InboundNormalizedMessage } from '@engine/gateway/types';
import type { GatewayLogger } from '@engine/gateway/types';
import type { HarnessRuntimeActionInvoker, HarnessRunResult } from '@engine/harness/runtime';
import type { ProtegeDatabase } from '@engine/shared/database';
import type { PersonaRoots } from '@engine/shared/personas';
import type { SchedulerResponsibility, SchedulerResponsibilityRun } from '@engine/scheduler/storage';

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { runHarnessForInboundMessage } from '@engine/harness/runtime';
import { readPersonaMetadata } from '@engine/shared/personas';
import {
  claimNextQueuedRun,
  findResponsibilityById,
  markRunFailed,
  markRunSucceeded,
  updateRunPromptSnapshot,
} from '@engine/scheduler/storage';
import { hashPrompt } from '@engine/scheduler/sync';

/**
 * Represents one run-result status for one scheduler runner cycle.
 */
export type SchedulerRunnerCycleResult = {
  status: 'idle' | 'succeeded' | 'failed';
  runId?: string;
  responsibilityId?: string;
  threadId?: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
  errorMessage?: string;
};

/**
 * Represents one scheduler executor function used to process one synthetic inbound message.
 */
export type SchedulerRunExecutor = (
  args: {
    message: InboundNormalizedMessage;
    senderAddress: string;
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
    logger?: GatewayLogger;
    correlationId?: string;
  },
) => Promise<HarnessRunResult>;

/**
 * Represents one failure-alert callback for failed scheduler runs.
 */
export type SchedulerFailureAlertFn = (
  args: {
    run: SchedulerResponsibilityRun;
    responsibility?: SchedulerResponsibility;
    errorMessage: string;
  },
) => Promise<void>;

/**
 * Executes one queued responsibility run when available.
 */
export async function runNextQueuedResponsibility(
  args: {
    db: ProtegeDatabase;
    personaId?: string;
    roots?: PersonaRoots;
    logger?: GatewayLogger;
    invokeRuntimeAction?: HarnessRuntimeActionInvoker;
    createRuntimeActionInvoker?: (
      args: {
        message: InboundNormalizedMessage;
      },
    ) => HarnessRuntimeActionInvoker | undefined;
    executeRun?: SchedulerRunExecutor;
    sendFailureAlert?: SchedulerFailureAlertFn;
    now?: () => string;
    excludedResponsibilityIds?: string[];
  },
): Promise<SchedulerRunnerCycleResult> {
  const run = claimNextQueuedRun({
    db: args.db,
    personaId: args.personaId,
    startedAt: args.now?.() ?? new Date().toISOString(),
    excludedResponsibilityIds: args.excludedResponsibilityIds,
  });
  if (!run) {
    return {
      status: 'idle',
    };
  }
  args.logger?.info({
    event: 'scheduler.run.claimed',
    context: {
      personaId: run.personaId,
      runId: run.id,
      responsibilityId: run.responsibilityId,
      triggeredAt: run.triggeredAt,
    },
  });

  const responsibility = findResponsibilityById({
    db: args.db,
    responsibilityId: run.responsibilityId,
  });
  if (!responsibility) {
    const errorMessage = `Responsibility not found for run ${run.id}: ${run.responsibilityId}`;
    markRunFailed({
      db: args.db,
      runId: run.id,
      finishedAt: args.now?.() ?? new Date().toISOString(),
      errorMessage,
      failureCategory: 'config',
    });
    args.logger?.error({
      event: 'scheduler.run.failed',
      context: {
        personaId: run.personaId,
        runId: run.id,
        responsibilityId: run.responsibilityId,
        threadId: null,
        messageId: null,
        failureCategory: 'config',
        errorMessage,
      },
    });
    await sendFailureAlertSafe({
      sendFailureAlert: args.sendFailureAlert,
      run,
      responsibility: undefined,
      errorMessage,
    });
    return {
      status: 'failed',
      runId: run.id,
      responsibilityId: run.responsibilityId,
      errorMessage,
    };
  }

  const threadId = `responsibility.${randomUUID()}`;
  const inboundMessageId = `<responsibility.${randomUUID()}@localhost>`;
  const promptSnapshot = readFileSync(responsibility.promptPath, 'utf8').trim();
  const promptHashAtRun = hashPrompt({
    prompt: promptSnapshot,
  });
  updateRunPromptSnapshot({
    db: args.db,
    runId: run.id,
    promptPathAtRun: responsibility.promptPath,
    promptHashAtRun,
    promptSnapshot,
  });
  const persona = readPersonaMetadata({
    personaId: responsibility.personaId,
    roots: args.roots,
  });
  const personaMailboxIdentity = persona.emailAddress;
  const message = buildResponsibilityInboundMessage({
    responsibility,
    threadId,
    messageId: inboundMessageId,
    promptSnapshot,
    receivedAt: args.now?.() ?? new Date().toISOString(),
    personaMailboxIdentity,
  });
  const executeRun = args.executeRun ?? runHarnessForInboundMessage;
  args.logger?.info({
    event: 'scheduler.run.started',
    context: {
      personaId: run.personaId,
      runId: run.id,
      responsibilityId: responsibility.id,
      threadId,
      messageId: inboundMessageId,
    },
  });

  try {
    const result = await executeRun({
      message,
      senderAddress: personaMailboxIdentity,
      invokeRuntimeAction: args.createRuntimeActionInvoker
        ? args.createRuntimeActionInvoker({ message }) ?? args.invokeRuntimeAction
        : args.invokeRuntimeAction,
      logger: args.logger,
      correlationId: `scheduler:${run.id}`,
    });
    markRunSucceeded({
      db: args.db,
      runId: run.id,
      finishedAt: args.now?.() ?? new Date().toISOString(),
      threadId,
      inboundMessageId,
      outboundMessageId: result.responseMessageId,
    });
    args.logger?.info({
      event: 'scheduler.run.completed',
      context: {
        personaId: run.personaId,
        runId: run.id,
        responsibilityId: responsibility.id,
        threadId,
        messageId: inboundMessageId,
        responseMessageId: result.responseMessageId,
      },
    });
    return {
      status: 'succeeded',
      runId: run.id,
      responsibilityId: responsibility.id,
      threadId,
      inboundMessageId,
      outboundMessageId: result.responseMessageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    markRunFailed({
      db: args.db,
      runId: run.id,
      finishedAt: args.now?.() ?? new Date().toISOString(),
      errorMessage,
      failureCategory: classifySchedulerFailureCategory({
        error,
      }),
      threadId,
      inboundMessageId,
    });
    await sendFailureAlertSafe({
      sendFailureAlert: args.sendFailureAlert,
      run,
      responsibility,
      errorMessage,
    });
    args.logger?.error({
      event: 'scheduler.run.failed',
      context: {
        personaId: run.personaId,
        runId: run.id,
        responsibilityId: responsibility.id,
        threadId,
        messageId: inboundMessageId,
        failureCategory: classifySchedulerFailureCategory({
          error,
        }),
        errorMessage,
      },
    });
    return {
      status: 'failed',
      runId: run.id,
      responsibilityId: responsibility.id,
      threadId,
      inboundMessageId,
      errorMessage,
    };
  }
}

/**
 * Classifies one scheduler execution error into a stable failure category.
 */
export function classifySchedulerFailureCategory(
  args: {
    error: unknown;
  },
): 'runtime' | 'unknown' {
  if (args.error instanceof Error) {
    return 'runtime';
  }

  return 'unknown';
}

/**
 * Builds one synthetic inbound message for one responsibility execution run.
 */
export function buildResponsibilityInboundMessage(
  args: {
    responsibility: SchedulerResponsibility;
    threadId: string;
    messageId: string;
    promptSnapshot: string;
    receivedAt: string;
    personaMailboxIdentity: string;
  },
): InboundNormalizedMessage {
  return {
    personaId: args.responsibility.personaId,
    messageId: args.messageId,
    threadId: args.threadId,
    from: [{ address: 'responsibility@localhost' }],
    to: [{ address: args.personaMailboxIdentity }],
    cc: [],
    bcc: [],
    envelopeRcptTo: [{ address: args.personaMailboxIdentity }],
    subject: `Responsibility: ${args.responsibility.name}`,
    text: args.promptSnapshot,
    html: undefined,
    references: [],
    receivedAt: args.receivedAt,
    rawMimePath: '__responsibility__',
    attachments: [],
    metadata: {
      source: 'responsibility',
      responsibility: {
        id: args.responsibility.id,
        name: args.responsibility.name,
        schedule: args.responsibility.schedule,
        promptPath: args.responsibility.promptPath,
        promptHash: args.responsibility.promptHash,
        enabled: args.responsibility.enabled,
      },
    },
  };
}

/**
 * Dispatches failure alerts without blocking run-status transitions on alert errors.
 */
export async function sendFailureAlertSafe(
  args: {
    sendFailureAlert?: SchedulerFailureAlertFn;
    run: SchedulerResponsibilityRun;
    responsibility?: SchedulerResponsibility;
    errorMessage: string;
  },
): Promise<void> {
  if (!args.sendFailureAlert) {
    return;
  }

  try {
    await args.sendFailureAlert({
      run: args.run,
      responsibility: args.responsibility,
      errorMessage: args.errorMessage,
    });
  } catch {
    // Alert dispatch failures are intentionally swallowed for v1 runner stability.
  }
}
