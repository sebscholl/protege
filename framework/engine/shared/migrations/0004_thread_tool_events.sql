CREATE TABLE IF NOT EXISTS thread_tool_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  parent_message_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('tool_call', 'tool_result')),
  tool_name TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_tool_events_thread_parent_run_step
  ON thread_tool_events(thread_id, parent_message_id, run_id, step_index);

CREATE INDEX IF NOT EXISTS idx_thread_tool_events_thread_created
  ON thread_tool_events(thread_id, created_at);
