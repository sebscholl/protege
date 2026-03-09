ALTER TABLE responsibilities RENAME TO responsibilities_legacy;

CREATE TABLE IF NOT EXISTS responsibilities (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  prompt_path TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
)
SELECT
  id,
  'legacy',
  name,
  schedule,
  '',
  hex(randomblob(16)),
  enabled,
  created_at,
  updated_at
FROM responsibilities_legacy;

DROP TABLE responsibilities_legacy;

CREATE INDEX IF NOT EXISTS idx_responsibilities_persona_enabled
  ON responsibilities(persona_id, enabled);

CREATE TABLE IF NOT EXISTS responsibility_runs (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL REFERENCES responsibilities(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed')),
  triggered_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  thread_id TEXT,
  inbound_message_id TEXT,
  outbound_message_id TEXT,
  error_message TEXT,
  prompt_path_at_run TEXT,
  prompt_hash_at_run TEXT,
  prompt_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_responsibility_runs_status_triggered
  ON responsibility_runs(status, triggered_at);

