DROP TABLE notification_outbox;
DROP TABLE guest_submissions;
DROP TABLE owner_profile;

CREATE TABLE owner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
  email TEXT NOT NULL CHECK (length(trim(email)) > 0),
  street TEXT NOT NULL CHECK (length(trim(street)) > 0),
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  postal_code TEXT NOT NULL CHECK (length(trim(postal_code)) > 0),
  country TEXT NOT NULL CHECK (length(trim(country)) > 0),
  birthday TEXT NOT NULL,
  phone TEXT NOT NULL,
  org TEXT,
  title TEXT,
  updated_at TEXT NOT NULL,
  photo_key TEXT
);

CREATE TABLE guest_submissions (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
  email TEXT NOT NULL CHECK (length(trim(email)) > 0),
  street TEXT NOT NULL CHECK (length(trim(street)) > 0),
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  postal_code TEXT NOT NULL CHECK (length(trim(postal_code)) > 0),
  country TEXT NOT NULL CHECK (length(trim(country)) > 0),
  birthday TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  phone TEXT NOT NULL,
  org TEXT,
  title TEXT,
  photo_key TEXT
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
