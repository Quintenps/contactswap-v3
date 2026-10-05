CREATE TABLE guest_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  vcard_signature TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
);