CREATE TABLE guest_submissions (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL CHECK (length(trim(email)) > 0),
  address TEXT NOT NULL CHECK (length(trim(address)) > 0),
  birthday TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX guest_submissions_expires_at_idx ON guest_submissions(expires_at);

CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES guest_submissions(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX notification_outbox_next_attempt_at_idx ON notification_outbox(next_attempt_at);
