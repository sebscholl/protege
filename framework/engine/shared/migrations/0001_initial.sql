CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  root_message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound', 'synthetic')),
  message_id TEXT NOT NULL,
  in_reply_to TEXT,
  sender TEXT NOT NULL,
  recipients TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT,
  received_at TEXT NOT NULL,
  raw_mime_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_received_at
  ON messages(thread_id, received_at);

CREATE TABLE IF NOT EXISTS responsibilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_pk UNINDEXED,
  thread_id UNINDEXED,
  subject,
  text_body
);

CREATE TRIGGER IF NOT EXISTS trg_messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(message_pk, thread_id, subject, text_body)
  VALUES (new.id, new.thread_id, new.subject, new.text_body);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE ON messages BEGIN
  DELETE FROM messages_fts WHERE message_pk = old.id;
  INSERT INTO messages_fts(message_pk, thread_id, subject, text_body)
  VALUES (new.id, new.thread_id, new.subject, new.text_body);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE message_pk = old.id;
END;
