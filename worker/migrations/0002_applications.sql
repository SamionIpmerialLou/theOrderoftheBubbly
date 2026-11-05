CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  flavor TEXT NOT NULL,
  accepted_terms INTEGER NOT NULL CHECK (accepted_terms IN (0, 1)),
  submitted_to_lord INTEGER NOT NULL CHECK (submitted_to_lord IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_created_at
  ON applications (created_at);

CREATE TABLE IF NOT EXISTS application_attempts (
  ip TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_attempts_ip_time
  ON application_attempts (ip, attempted_at);
