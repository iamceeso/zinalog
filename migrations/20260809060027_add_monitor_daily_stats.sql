-- migrate:up
-- Long-range uptime rollup, independent of the monitor_checks row cap: every
-- check bumps today's row here, so weekly/monthly/yearly stats stay accurate
-- even after old raw checks get pruned.
CREATE TABLE IF NOT EXISTS monitor_daily_stats (
  monitor_id            INTEGER NOT NULL,
  day                    TEXT NOT NULL,
  total_checks           INTEGER NOT NULL DEFAULT 0,
  up_checks              INTEGER NOT NULL DEFAULT 0,
  response_time_sum_ms   INTEGER NOT NULL DEFAULT 0,
  response_time_count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (monitor_id, day),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monitor_daily_stats_day ON monitor_daily_stats(day);

-- migrate:down
DROP INDEX IF EXISTS idx_monitor_daily_stats_day;
DROP TABLE IF EXISTS monitor_daily_stats;
