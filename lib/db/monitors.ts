import { encryptSecret } from "../secret-crypto";
import { getDb, withTransaction } from "./core";

export type MonitorType = "http" | "tcp" | "ping";
export type MonitorStatus = "up" | "down" | "blocked" | "pending";

export interface Monitor {
  id: number;
  name: string;
  type: MonitorType;
  target: string;
  port: number | null;
  method: string | null;
  headers: string | null;
  basic_auth_user: string | null;
  basic_auth_pass: string | null;
  expected_status: string;
  interval_seconds: number;
  timeout_seconds: number;
  retries: number;
  follow_redirects: number;
  verify_ssl: number;
  is_active: number;
  notify_enabled: number;
  status: MonitorStatus;
  consecutive_fails: number;
  last_check_at: string | null;
  last_status_change_at: string | null;
  ssl_expires_at: string | null;
  ssl_issuer: string | null;
  ssl_valid: number | null;
  domain_expires_at: string | null;
  domain_registrar: string | null;
  domain_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorCheck {
  id: number;
  monitor_id: number;
  status: "up" | "down" | "blocked";
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string;
}

export interface MonitorCheckResult {
  status: "up" | "down" | "blocked";
  status_code?: number | null;
  response_time_ms?: number | null;
  error?: string | null;
  ssl?: {
    expires_at: string | null;
    issuer: string | null;
    valid: boolean;
  } | null;
}

export interface MonitorCheckOutcome {
  previousStatus: MonitorStatus;
  newStatus: MonitorStatus;
  statusChanged: boolean;
  check: MonitorCheckResult;
}

const MONITOR_CHECKS_PER_MONITOR_LIMIT = 2000;

export interface MonitorListItem extends Monitor {
  last_response_time_ms: number | null;
}

export async function listMonitors(): Promise<MonitorListItem[]> {
  const database = await getDb();
  return (await database.all<MonitorListItem[]>(
    `SELECT m.*,
       (SELECT response_time_ms FROM monitor_checks c
        WHERE c.monitor_id = m.id ORDER BY c.id DESC LIMIT 1) as last_response_time_ms
     FROM monitors m
     ORDER BY m.name COLLATE NOCASE`
  )) as MonitorListItem[];
}

export async function getMonitorById(id: number): Promise<Monitor | null> {
  const database = await getDb();
  const row = (await database.get<Monitor>(
    "SELECT * FROM monitors WHERE id = ?",
    [id]
  )) as Monitor | undefined;
  return row ?? null;
}

export async function getDueMonitors(): Promise<Monitor[]> {
  const database = await getDb();
  return (await database.all<Monitor[]>(
    `SELECT * FROM monitors
     WHERE is_active = 1
     AND (
       last_check_at IS NULL
       OR datetime(last_check_at, '+' || interval_seconds || ' seconds') <= datetime('now')
     )`
  )) as Monitor[];
}

// Domain registration WHOIS data changes far slower than uptime, so it's
// refreshed on its own daily cadence rather than every check.
export async function getMonitorsDueForDomainRefresh(
  limit = 5
): Promise<Monitor[]> {
  const database = await getDb();
  return (await database.all<Monitor[]>(
    `SELECT * FROM monitors
     WHERE is_active = 1
     AND (
       domain_checked_at IS NULL
       OR datetime(domain_checked_at, '+1 day') <= datetime('now')
     )
     LIMIT ?`,
    [limit]
  )) as Monitor[];
}

export async function updateMonitorDomainInfo(
  id: number,
  data: { expires_at: string | null; registrar: string | null }
): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE monitors
     SET domain_expires_at = ?, domain_registrar = ?, domain_checked_at = datetime('now')
     WHERE id = ?`,
    [data.expires_at, data.registrar, id]
  );
}

export async function createMonitor(data: {
  name: string;
  type: MonitorType;
  target: string;
  port?: number | null;
  method?: string | null;
  headers?: string | null;
  basic_auth_user?: string | null;
  basic_auth_pass?: string | null;
  expected_status?: string;
  interval_seconds?: number;
  timeout_seconds?: number;
  retries?: number;
  follow_redirects?: boolean;
  verify_ssl?: boolean;
  is_active?: boolean;
  notify_enabled?: boolean;
}): Promise<Monitor> {
  const database = await getDb();
  const result = await database.run(
    `INSERT INTO monitors (
       name, type, target, port, method, headers, basic_auth_user, basic_auth_pass,
       expected_status, interval_seconds, timeout_seconds, retries,
       follow_redirects, verify_ssl, is_active, notify_enabled
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.type,
      data.target,
      data.port ?? null,
      data.method ?? "GET",
      data.headers ? encryptSecret(data.headers) : null,
      data.basic_auth_user ?? null,
      data.basic_auth_pass ? encryptSecret(data.basic_auth_pass) : null,
      data.expected_status ?? "200-299",
      data.interval_seconds ?? 60,
      data.timeout_seconds ?? 10,
      data.retries ?? 0,
      data.follow_redirects === false ? 0 : 1,
      data.verify_ssl === false ? 0 : 1,
      data.is_active === false ? 0 : 1,
      data.notify_enabled === false ? 0 : 1,
    ]
  );

  const created = await getMonitorById(result.lastID as number);
  if (!created) throw new Error("Failed to create monitor");
  return created;
}

export async function updateMonitor(
  id: number,
  data: Partial<{
    name: string;
    type: MonitorType;
    target: string;
    port: number | null;
    method: string | null;
    headers: string | null;
    basic_auth_user: string | null;
    basic_auth_pass: string | null;
    expected_status: string;
    interval_seconds: number;
    timeout_seconds: number;
    retries: number;
    follow_redirects: boolean;
    verify_ssl: boolean;
    is_active: boolean;
    notify_enabled: boolean;
  }>
): Promise<boolean> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const setField = (col: string, value: unknown) => {
    fields.push(`${col} = ?`);
    params.push(value);
  };

  if (data.name !== undefined) setField("name", data.name);
  if (data.type !== undefined) setField("type", data.type);
  if (data.target !== undefined) setField("target", data.target);
  if (data.port !== undefined) setField("port", data.port);
  if (data.method !== undefined) setField("method", data.method);
  if (data.headers !== undefined)
    setField("headers", data.headers ? encryptSecret(data.headers) : null);
  if (data.basic_auth_user !== undefined)
    setField("basic_auth_user", data.basic_auth_user);
  if (data.basic_auth_pass !== undefined)
    setField(
      "basic_auth_pass",
      data.basic_auth_pass ? encryptSecret(data.basic_auth_pass) : null
    );
  if (data.expected_status !== undefined)
    setField("expected_status", data.expected_status);
  if (data.interval_seconds !== undefined)
    setField("interval_seconds", data.interval_seconds);
  if (data.timeout_seconds !== undefined)
    setField("timeout_seconds", data.timeout_seconds);
  if (data.retries !== undefined) setField("retries", data.retries);
  if (data.follow_redirects !== undefined)
    setField("follow_redirects", data.follow_redirects ? 1 : 0);
  if (data.verify_ssl !== undefined)
    setField("verify_ssl", data.verify_ssl ? 1 : 0);
  if (data.is_active !== undefined)
    setField("is_active", data.is_active ? 1 : 0);
  if (data.notify_enabled !== undefined)
    setField("notify_enabled", data.notify_enabled ? 1 : 0);

  if (fields.length === 0) return true;

  fields.push("updated_at = datetime('now')");
  params.push(id);

  const database = await getDb();
  const result = await database.run(
    `UPDATE monitors SET ${fields.join(", ")} WHERE id = ?`,
    params
  );

  return (result.changes ?? 0) > 0;
}

export async function deleteMonitor(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("DELETE FROM monitors WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

export async function recordMonitorCheck(
  monitor: Monitor,
  result: MonitorCheckResult
): Promise<MonitorCheckOutcome> {
  const database = await getDb();

  const previousStatus = monitor.status;
  let newStatus: MonitorStatus = previousStatus;
  let consecutiveFails = monitor.consecutive_fails;

  if (result.status === "up") {
    consecutiveFails = 0;
    newStatus = "up";
  } else if (result.status === "blocked") {
    consecutiveFails = 0;
    newStatus = "blocked";
  } else {
    consecutiveFails += 1;
    if (consecutiveFails > monitor.retries) {
      newStatus = "down";
    }
  }

  const statusChanged = newStatus !== previousStatus;

  const updateFields = [
    "status = ?",
    "consecutive_fails = ?",
    "last_check_at = datetime('now')",
  ];
  const updateParams: unknown[] = [newStatus, consecutiveFails];

  if (statusChanged) {
    updateFields.push("last_status_change_at = datetime('now')");
  }

  if (result.ssl !== undefined) {
    updateFields.push("ssl_expires_at = ?", "ssl_issuer = ?", "ssl_valid = ?");
    updateParams.push(
      result.ssl?.expires_at ?? null,
      result.ssl?.issuer ?? null,
      result.ssl ? (result.ssl.valid ? 1 : 0) : null
    );
  }

  updateParams.push(monitor.id);

  await withTransaction(database, async () => {
    await database.run(
      `INSERT INTO monitor_checks (monitor_id, status, status_code, response_time_ms, error)
       VALUES (?, ?, ?, ?, ?)`,
      [
        monitor.id,
        result.status,
        result.status_code ?? null,
        result.response_time_ms ?? null,
        result.error ?? null,
      ]
    );

    await database.run(
      `DELETE FROM monitor_checks
       WHERE monitor_id = ?
       AND id NOT IN (
         SELECT id FROM monitor_checks
         WHERE monitor_id = ?
         ORDER BY id DESC
         LIMIT ?
       )`,
      [monitor.id, monitor.id, MONITOR_CHECKS_PER_MONITOR_LIMIT]
    );

    await database.run(
      `UPDATE monitors SET ${updateFields.join(", ")} WHERE id = ?`,
      updateParams
    );
  });

  return { previousStatus, newStatus, statusChanged, check: result };
}

export async function listMonitorChecks(
  monitorId: number,
  limit = 100
): Promise<MonitorCheck[]> {
  const database = await getDb();
  return (await database.all<MonitorCheck[]>(
    `SELECT * FROM monitor_checks
     WHERE monitor_id = ?
     ORDER BY checked_at DESC, id DESC
     LIMIT ?`,
    [monitorId, limit]
  )) as MonitorCheck[];
}

export interface RecentMonitorCheck extends MonitorCheck {
  monitor_name: string;
  monitor_type: MonitorType;
}

export async function listRecentChecksAcrossMonitors(
  limit = 20
): Promise<RecentMonitorCheck[]> {
  const database = await getDb();
  return (await database.all<RecentMonitorCheck[]>(
    `SELECT c.*, m.name as monitor_name, m.type as monitor_type
     FROM monitor_checks c
     JOIN monitors m ON m.id = c.monitor_id
     ORDER BY c.checked_at DESC, c.id DESC
     LIMIT ?`,
    [limit]
  )) as RecentMonitorCheck[];
}

export async function getMonitorUptimeStats(
  monitorId: number,
  hours = 24
): Promise<{
  uptimePercent: number | null;
  avgResponseMs: number | null;
  totalChecks: number;
}> {
  const database = await getDb();
  const row = (await database.get<{
    total: number;
    up: number;
    avg_ms: number | null;
  }>(
    `SELECT
       SUM(CASE WHEN status IN ('up', 'down') THEN 1 ELSE 0 END) as total,
       SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up,
       AVG(CASE WHEN status = 'up' THEN response_time_ms ELSE NULL END) as avg_ms
     FROM monitor_checks
     WHERE monitor_id = ? AND checked_at >= datetime('now', '-' || ? || ' hours')`,
    [monitorId, hours]
  )) as { total: number; up: number; avg_ms: number | null } | undefined;

  const total = row?.total ?? 0;
  return {
    uptimePercent: total > 0 ? Math.round((row!.up / total) * 1000) / 10 : null,
    avgResponseMs: row?.avg_ms != null ? Math.round(row.avg_ms) : null,
    totalChecks: total,
  };
}
