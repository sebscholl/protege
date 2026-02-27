import type { ProtegeDatabase } from '@engine/shared/database';

import { randomUUID } from 'node:crypto';

/**
 * Represents one indexed responsibility definition stored for scheduler runtime lookup.
 */
export type SchedulerResponsibility = {
  id: string;
  personaId: string;
  name: string;
  schedule: string;
  promptPath: string;
  promptHash: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Represents one run record for one scheduled responsibility execution attempt.
 */
export type SchedulerResponsibilityRun = {
  id: string;
  responsibilityId: string;
  personaId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped_overlap' | 'skipped_concurrency';
  triggeredAt: string;
  startedAt?: string;
  finishedAt?: string;
  threadId?: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
  errorMessage?: string;
  failureCategory?: 'config' | 'runtime' | 'unknown';
  promptPathAtRun?: string;
  promptHashAtRun?: string;
  promptSnapshot?: string;
};

/**
 * Upserts one responsibility definition row for runtime scheduling lookup.
 */
export function upsertResponsibility(
  args: {
    db: ProtegeDatabase;
    responsibility: {
      id: string;
      personaId: string;
      name: string;
      schedule: string;
      promptPath: string;
      promptHash: string;
      enabled: boolean;
    };
    nowIso?: string;
  },
): void {
  const nowIso = args.nowIso ?? new Date().toISOString();
  args.db.prepare(`
    INSERT INTO responsibilities (
      id,
      persona_id,
      name,
      schedule,
      prompt_path,
      prompt_hash,
      enabled,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      persona_id = excluded.persona_id,
      name = excluded.name,
      schedule = excluded.schedule,
      prompt_path = excluded.prompt_path,
      prompt_hash = excluded.prompt_hash,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    args.responsibility.id,
    args.responsibility.personaId,
    args.responsibility.name,
    args.responsibility.schedule,
    args.responsibility.promptPath,
    args.responsibility.promptHash,
    args.responsibility.enabled ? 1 : 0,
    nowIso,
    nowIso,
  );
}

/**
 * Marks one existing responsibility as disabled.
 */
export function disableResponsibility(
  args: {
    db: ProtegeDatabase;
    responsibilityId: string;
    nowIso?: string;
  },
): void {
  args.db.prepare(`
    UPDATE responsibilities
    SET enabled = 0, updated_at = ?
    WHERE id = ?
  `).run(args.nowIso ?? new Date().toISOString(), args.responsibilityId);
}

/**
 * Lists all responsibilities for one persona, sorted by name.
 */
export function listResponsibilitiesByPersona(
  args: {
    db: ProtegeDatabase;
    personaId: string;
  },
): SchedulerResponsibility[] {
  const rows = args.db.prepare(`
    SELECT
      id,
      persona_id,
      name,
      schedule,
      prompt_path,
      prompt_hash,
      enabled,
      created_at,
      updated_at
    FROM responsibilities
    WHERE persona_id = ?
    ORDER BY name ASC
  `).all(args.personaId) as Array<Record<string, string | number>>;

  return rows.map((row) => toSchedulerResponsibility({
    row,
  }));
}

/**
 * Lists enabled responsibilities for one persona.
 */
export function listEnabledResponsibilitiesByPersona(
  args: {
    db: ProtegeDatabase;
    personaId: string;
  },
): SchedulerResponsibility[] {
  const rows = args.db.prepare(`
    SELECT
      id,
      persona_id,
      name,
      schedule,
      prompt_path,
      prompt_hash,
      enabled,
      created_at,
      updated_at
    FROM responsibilities
    WHERE persona_id = ? AND enabled = 1
    ORDER BY name ASC
  `).all(args.personaId) as Array<Record<string, string | number>>;

  return rows.map((row) => toSchedulerResponsibility({
    row,
  }));
}

/**
 * Returns one responsibility row when it exists.
 */
export function findResponsibilityById(
  args: {
    db: ProtegeDatabase;
    responsibilityId: string;
  },
): SchedulerResponsibility | undefined {
  const row = args.db.prepare(`
    SELECT
      id,
      persona_id,
      name,
      schedule,
      prompt_path,
      prompt_hash,
      enabled,
      created_at,
      updated_at
    FROM responsibilities
    WHERE id = ?
  `).get(args.responsibilityId) as Record<string, string | number> | undefined;
  if (!row) {
    return undefined;
  }

  return toSchedulerResponsibility({
    row,
  });
}

/**
 * Enqueues one responsibility run row in queued state.
 */
export function enqueueResponsibilityRun(
  args: {
    db: ProtegeDatabase;
    run: {
      responsibilityId: string;
      personaId: string;
      triggeredAt?: string;
      promptPathAtRun?: string;
      promptHashAtRun?: string;
      promptSnapshot?: string;
    };
    runId?: string;
  },
): string {
  const runId = args.runId ?? randomUUID();
  args.db.prepare(`
    INSERT INTO responsibility_runs (
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)
  `).run(
    runId,
    args.run.responsibilityId,
    args.run.personaId,
    args.run.triggeredAt ?? new Date().toISOString(),
    args.run.promptPathAtRun ?? null,
    args.run.promptHashAtRun ?? null,
    args.run.promptSnapshot ?? null,
  );

  return runId;
}

/**
 * Enqueues one responsibility run only when no queued/running run exists for the same responsibility.
 */
export function enqueueResponsibilityRunIfIdle(
  args: {
    db: ProtegeDatabase;
    run: {
      responsibilityId: string;
      personaId: string;
      triggeredAt?: string;
      promptPathAtRun?: string;
      promptHashAtRun?: string;
      promptSnapshot?: string;
    };
    runId?: string;
  },
): {
  enqueued: boolean;
  runId?: string;
  skipReason?: 'overlap';
} {
  const runId = args.runId ?? randomUUID();
  const result = args.db.prepare(`
    INSERT INTO responsibility_runs (
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    )
    SELECT ?, ?, ?, 'queued', ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM responsibility_runs
      WHERE responsibility_id = ?
        AND status IN ('queued', 'running')
    )
  `).run(
    runId,
    args.run.responsibilityId,
    args.run.personaId,
    args.run.triggeredAt ?? new Date().toISOString(),
    args.run.promptPathAtRun ?? null,
    args.run.promptHashAtRun ?? null,
    args.run.promptSnapshot ?? null,
    args.run.responsibilityId,
  );
  if (result.changes === 1) {
    return {
      enqueued: true,
      runId,
    };
  }

  return {
    enqueued: false,
    skipReason: 'overlap',
  };
}

/**
 * Returns true when at least one queued run exists for one persona.
 */
export function hasQueuedRunForPersona(
  args: {
    db: ProtegeDatabase;
    personaId: string;
  },
): boolean {
  const row = args.db.prepare(`
    SELECT 1 AS exists_flag
    FROM responsibility_runs
    WHERE persona_id = ?
      AND status = 'queued'
    LIMIT 1
  `).get(args.personaId) as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

/**
 * Claims the oldest queued run and marks it running.
 */
export function claimNextQueuedRun(
  args: {
    db: ProtegeDatabase;
    personaId?: string;
    startedAt?: string;
    excludedResponsibilityIds?: string[];
  },
): SchedulerResponsibilityRun | undefined {
  const exclusionSql = buildResponsibilityExclusionSql({
    excludedResponsibilityIds: args.excludedResponsibilityIds,
  });
  const queued = (args.personaId
    ? args.db.prepare(`
    SELECT
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      started_at,
      finished_at,
      thread_id,
      inbound_message_id,
      outbound_message_id,
      error_message,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    FROM responsibility_runs AS queued
    WHERE queued.status = 'queued'
      AND queued.persona_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM responsibility_runs AS running
        WHERE running.responsibility_id = queued.responsibility_id
          AND running.status = 'running'
      )
      ${exclusionSql}
    ORDER BY triggered_at ASC
    LIMIT 1
  `).get(...buildClaimQueryParams({
      personaId: args.personaId,
      excludedResponsibilityIds: args.excludedResponsibilityIds,
    }))
    : args.db.prepare(`
    SELECT
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      started_at,
      finished_at,
      thread_id,
      inbound_message_id,
      outbound_message_id,
      error_message,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    FROM responsibility_runs AS queued
    WHERE queued.status = 'queued'
      AND NOT EXISTS (
        SELECT 1
        FROM responsibility_runs AS running
        WHERE running.responsibility_id = queued.responsibility_id
          AND running.status = 'running'
      )
      ${exclusionSql}
    ORDER BY triggered_at ASC
    LIMIT 1
  `).get(...buildClaimQueryParams({
      excludedResponsibilityIds: args.excludedResponsibilityIds,
    }))) as Record<string, string | null> | undefined;
  if (!queued) {
    return undefined;
  }

  const startedAt = args.startedAt ?? new Date().toISOString();
  const claimed = args.db.prepare(`
    UPDATE responsibility_runs
    SET status = 'running', started_at = ?
    WHERE id = ? AND status = 'queued'
  `).run(startedAt, queued.id);
  if (claimed.changes !== 1) {
    return undefined;
  }

  const updated = args.db.prepare(`
    SELECT
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      started_at,
      finished_at,
      thread_id,
      inbound_message_id,
      outbound_message_id,
      error_message,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    FROM responsibility_runs
    WHERE id = ?
  `).get(queued.id) as Record<string, string | null>;
  return toSchedulerResponsibilityRun({
    row: updated,
  });
}

/**
 * Builds one SQL clause excluding specific responsibility ids from queued-run claims.
 */
export function buildResponsibilityExclusionSql(
  args: {
    excludedResponsibilityIds?: string[];
  },
): string {
  if (!args.excludedResponsibilityIds || args.excludedResponsibilityIds.length === 0) {
    return '';
  }

  const placeholders = args.excludedResponsibilityIds.map(() => '?').join(', ');
  return `AND queued.responsibility_id NOT IN (${placeholders})`;
}

/**
 * Builds positional parameters for queued-run claim queries.
 */
export function buildClaimQueryParams(
  args: {
    personaId?: string;
    excludedResponsibilityIds?: string[];
  },
): string[] {
  const output: string[] = [];
  if (args.personaId) {
    output.push(args.personaId);
  }
  if (args.excludedResponsibilityIds && args.excludedResponsibilityIds.length > 0) {
    output.push(...args.excludedResponsibilityIds);
  }

  return output;
}

/**
 * Stores one immutable prompt snapshot on a run row for reproducible execution history.
 */
export function updateRunPromptSnapshot(
  args: {
    db: ProtegeDatabase;
    runId: string;
    promptPathAtRun: string;
    promptHashAtRun: string;
    promptSnapshot: string;
  },
): void {
  args.db.prepare(`
    UPDATE responsibility_runs
    SET
      prompt_path_at_run = ?,
      prompt_hash_at_run = ?,
      prompt_snapshot = ?
    WHERE id = ?
  `).run(
    args.promptPathAtRun,
    args.promptHashAtRun,
    args.promptSnapshot,
    args.runId,
  );
}

/**
 * Marks one running/queued run as succeeded with execution metadata.
 */
export function markRunSucceeded(
  args: {
    db: ProtegeDatabase;
    runId: string;
    finishedAt?: string;
    threadId: string;
    inboundMessageId: string;
    outboundMessageId?: string;
  },
): void {
  args.db.prepare(`
    UPDATE responsibility_runs
    SET
      status = 'succeeded',
      finished_at = ?,
      thread_id = ?,
      inbound_message_id = ?,
      outbound_message_id = ?,
      error_message = NULL,
      failure_category = NULL
    WHERE id = ?
  `).run(
    args.finishedAt ?? new Date().toISOString(),
    args.threadId,
    args.inboundMessageId,
    args.outboundMessageId ?? null,
    args.runId,
  );
}

/**
 * Marks one run as failed and stores failure metadata.
 */
export function markRunFailed(
  args: {
    db: ProtegeDatabase;
    runId: string;
    finishedAt?: string;
    errorMessage: string;
    failureCategory?: 'config' | 'runtime' | 'unknown';
    threadId?: string;
    inboundMessageId?: string;
  },
): void {
  args.db.prepare(`
    UPDATE responsibility_runs
    SET
      status = 'failed',
      finished_at = ?,
      error_message = ?,
      failure_category = ?,
      thread_id = COALESCE(?, thread_id),
      inbound_message_id = COALESCE(?, inbound_message_id)
    WHERE id = ?
  `).run(
    args.finishedAt ?? new Date().toISOString(),
    args.errorMessage,
    args.failureCategory ?? 'unknown',
    args.threadId ?? null,
    args.inboundMessageId ?? null,
    args.runId,
  );
}

/**
 * Persists one skipped run outcome row for one responsibility tick that was intentionally not executed.
 */
export function recordSkippedRun(
  args: {
    db: ProtegeDatabase;
    runId?: string;
    responsibilityId: string;
    personaId: string;
    status: 'skipped_overlap' | 'skipped_concurrency';
    triggeredAt?: string;
    finishedAt?: string;
    errorMessage?: string;
  },
): string {
  const runId = args.runId ?? randomUUID();
  args.db.prepare(`
    INSERT INTO responsibility_runs (
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      finished_at,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    args.responsibilityId,
    args.personaId,
    args.status,
    args.triggeredAt ?? new Date().toISOString(),
    args.finishedAt ?? args.triggeredAt ?? new Date().toISOString(),
    args.errorMessage ?? null,
  );

  return runId;
}

/**
 * Lists responsibility run history for one persona newest-first.
 */
export function listResponsibilityRunsByPersona(
  args: {
    db: ProtegeDatabase;
    personaId: string;
  },
): SchedulerResponsibilityRun[] {
  const rows = args.db.prepare(`
    SELECT
      id,
      responsibility_id,
      persona_id,
      status,
      triggered_at,
      started_at,
      finished_at,
      thread_id,
      inbound_message_id,
      outbound_message_id,
      error_message,
      failure_category,
      prompt_path_at_run,
      prompt_hash_at_run,
      prompt_snapshot
    FROM responsibility_runs
    WHERE persona_id = ?
    ORDER BY triggered_at DESC
  `).all(args.personaId) as Array<Record<string, string | null>>;

  return rows.map((row) => toSchedulerResponsibilityRun({
    row,
  }));
}

/**
 * Converts one SQL responsibility row into scheduler domain shape.
 */
export function toSchedulerResponsibility(
  args: {
    row: Record<string, string | number>;
  },
): SchedulerResponsibility {
  return {
    id: String(args.row.id ?? ''),
    personaId: String(args.row.persona_id ?? ''),
    name: String(args.row.name ?? ''),
    schedule: String(args.row.schedule ?? ''),
    promptPath: String(args.row.prompt_path ?? ''),
    promptHash: String(args.row.prompt_hash ?? ''),
    enabled: Number(args.row.enabled ?? 0) === 1,
    createdAt: String(args.row.created_at ?? ''),
    updatedAt: String(args.row.updated_at ?? ''),
  };
}

/**
 * Converts one SQL run row into scheduler run domain shape.
 */
export function toSchedulerResponsibilityRun(
  args: {
    row: Record<string, string | null>;
  },
): SchedulerResponsibilityRun {
  return {
    id: String(args.row.id ?? ''),
    responsibilityId: String(args.row.responsibility_id ?? ''),
    personaId: String(args.row.persona_id ?? ''),
    status: (args.row.status ?? 'queued') as SchedulerResponsibilityRun['status'],
    triggeredAt: String(args.row.triggered_at ?? ''),
    startedAt: args.row.started_at ?? undefined,
    finishedAt: args.row.finished_at ?? undefined,
    threadId: args.row.thread_id ?? undefined,
    inboundMessageId: args.row.inbound_message_id ?? undefined,
    outboundMessageId: args.row.outbound_message_id ?? undefined,
    errorMessage: args.row.error_message ?? undefined,
    failureCategory: args.row.failure_category as SchedulerResponsibilityRun['failureCategory'],
    promptPathAtRun: args.row.prompt_path_at_run ?? undefined,
    promptHashAtRun: args.row.prompt_hash_at_run ?? undefined,
    promptSnapshot: args.row.prompt_snapshot ?? undefined,
  };
}
