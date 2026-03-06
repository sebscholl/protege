CREATE TABLE IF NOT EXISTS thread_memory_states (
  thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  source_message_id TEXT,
  source_received_at TEXT,
  source_tool_event_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_memory_states_persona_updated
  ON thread_memory_states(persona_id, updated_at);

CREATE TABLE IF NOT EXISTS persona_memory_synthesis_state (
  persona_id TEXT PRIMARY KEY,
  dirty INTEGER NOT NULL DEFAULT 0,
  dirty_since TEXT,
  last_trigger_thread_id TEXT,
  last_triggered_at TEXT,
  last_synthesized_at TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persona_memory_synthesis_state_dirty
  ON persona_memory_synthesis_state(dirty, updated_at);
