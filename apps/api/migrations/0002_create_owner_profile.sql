CREATE TABLE owner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL CHECK (length(trim(email)) > 0),
  address TEXT NOT NULL CHECK (length(trim(address)) > 0),
  birthday TEXT NOT NULL,
  vcard TEXT NOT NULL,
  updated_at TEXT NOT NULL
);