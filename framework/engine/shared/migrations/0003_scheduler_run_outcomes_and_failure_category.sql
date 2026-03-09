ALTER TABLE responsibility_runs RENAME TO responsibility_runs_legacy;

CREATE TABLE IF NOT EXISTS responsibility_runs (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL REFERENCES responsibilities(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'skipped_overlap', 'skipped_concurrency')),
  triggered_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  thread_id TEXT,
  inbound_message_id TEXT,
  outbound_message_id TEXT,
  error_message TEXT,
  failure_category TEXT,
  prompt_path_at_run TEXT,
  prompt_hash_at_run TEXT,
  prompt_snapshot TEXT
);

INSERT INTO responsibility_runs (
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
)
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
  NULL,
  prompt_path_at_run,
  prompt_hash_at_run,
  prompt_snapshot
FROM responsibility_runs_legacy;

DROP TABLE responsibility_runs_legacy;

CREATE INDEX IF NOT EXISTS idx_responsibility_runs_status_triggered
  ON responsibility_runs(status, triggered_at);
