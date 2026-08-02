-- migrate:up
CREATE TABLE IF NOT EXISTS monitors (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT NOT NULL UNIQUE,
  type                   TEXT NOT NULL,
  target                 TEXT NOT NULL UNIQUE,
  port                   INTEGER,
  method                 TEXT DEFAULT 'GET',
  headers                TEXT,
  basic_auth_user        TEXT,
  basic_auth_pass        TEXT,
  expected_status        TEXT NOT NULL DEFAULT '200-299',
  interval_seconds       INTEGER NOT NULL DEFAULT 60,
  timeout_seconds        INTEGER NOT NULL DEFAULT 10,
  retries                INTEGER NOT NULL DEFAULT 0,
  follow_redirects       INTEGER NOT NULL DEFAULT 1,
  verify_ssl             INTEGER NOT NULL DEFAULT 1,
  is_active              INTEGER NOT NULL DEFAULT 1,
  notify_enabled         INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'pending',
  consecutive_fails      INTEGER NOT NULL DEFAULT 0,
  last_check_at          DATETIME,
  last_status_change_at  DATETIME,
  ssl_expires_at         DATETIME,
  ssl_issuer             TEXT,
  ssl_valid              INTEGER,
  created_at             DATETIME DEFAULT (datetime('now')),
  updated_at             DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id       INTEGER NOT NULL,
  status           TEXT NOT NULL,
  status_code      INTEGER,
  response_time_ms INTEGER,
  error            TEXT,
  checked_at       DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monitors_is_active ON monitors(is_active);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_monitor_id ON monitor_checks(monitor_id);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_checked_at ON monitor_checks(checked_at);

-- migrate:down
DROP INDEX IF EXISTS idx_monitor_checks_checked_at;
DROP INDEX IF EXISTS idx_monitor_checks_monitor_id;
DROP INDEX IF EXISTS idx_monitors_is_active;
DROP TABLE IF EXISTS monitor_checks;
DROP TABLE IF EXISTS monitors;
