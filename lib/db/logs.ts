import {
  addAllowedServicesCondition,
  getDb,
  type Log,
  type LogFilters,
  type SqliteDatabase,
} from "./core";
import { getSettingFromDb } from "./settings";
import { emitNewLog } from "../log-events";

async function getMaxLogsLimitFromDb(
  database: SqliteDatabase
): Promise<number> {
  const rawValue = await getSettingFromDb(database, "max_logs");
  const parsedValue = Number.parseInt(rawValue ?? "", 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return 100000;
  }

  return Math.floor(parsedValue);
}

async function trimLogsToMaxWithDb(
  database: SqliteDatabase,
  maxLogs: number
): Promise<number> {
  const safeMaxLogs = Math.floor(maxLogs);
  if (!Number.isFinite(safeMaxLogs) || safeMaxLogs < 1) {
    throw new Error(`Invalid max_logs value: ${maxLogs}`);
  }

  const result = await database.run(
    `DELETE FROM logs
     WHERE id IN (
       SELECT id
       FROM logs
       ORDER BY created_at DESC, id DESC
       LIMIT -1 OFFSET ?
     )`,
    [safeMaxLogs]
  );

  return result.changes ?? 0;
}

export async function queryLogs(
  filters: LogFilters = {},
  allowedServices: string[] | null = null
): Promise<{
  logs: Log[];
  total: number;
}> {
  const { level, service, search, from, to, page = 1, limit = 50 } = filters;
  const conditions: string[] = [];
  const params: unknown[] = [];

  addAllowedServicesCondition(conditions, params, allowedServices);
  if (level && level !== "all") {
    conditions.push("level = ?");
    params.push(level);
  }
  if (service && service !== "all") {
    conditions.push("service = ?");
    params.push(service);
  }
  if (search) {
    conditions.push("(message LIKE ? OR service LIKE ? OR metadata LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (from) {
    conditions.push("datetime(created_at) >= datetime(?)");
    params.push(from);
  }
  if (to) {
    conditions.push("datetime(created_at) <= datetime(?)");
    params.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  const database = await getDb();

  const logs = (await database.all<Log[]>(
    `SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )) as Log[];

  const row = (await database.get<{ total: number }>(
    `SELECT COUNT(*) as total FROM logs ${where}`,
    params
  )) as { total: number } | undefined;

  return { logs, total: row?.total ?? 0 };
}

export async function insertLog(data: {
  level: string;
  message: string;
  service?: string | null;
  stack?: string | null;
  metadata?: string | null;
  api_key_id?: number | null;
}): Promise<number> {
  const database = await getDb();
  const maxLogs = await getMaxLogsLimitFromDb(database);

  const result = await database.run(
    `INSERT INTO logs (level, message, service, stack, metadata, api_key_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.level,
      data.message,
      data.service ?? null,
      data.stack ?? null,
      data.metadata ?? null,
      data.api_key_id ?? null,
    ]
  );

  await trimLogsToMaxWithDb(database, maxLogs);

  const id = result.lastID as number;
  const inserted = (await database.get<Log>(`SELECT * FROM logs WHERE id = ?`, [
    id,
  ])) as Log | undefined;
  if (inserted) {
    emitNewLog(inserted);
  }

  return id;
}

export async function trimLogsToMax(maxLogs: number): Promise<number> {
  return trimLogsToMaxWithDb(await getDb(), maxLogs);
}

export async function getStats(allowedServices: string[] | null = null) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const database = await getDb();
  const baseConditions: string[] = [];
  const baseParams: unknown[] = [];
  addAllowedServicesCondition(baseConditions, baseParams, allowedServices);
  const baseWhere = baseConditions.length
    ? `WHERE ${baseConditions.join(" AND ")}`
    : "";

  const todayConditions = [...baseConditions, "created_at >= ?"];
  const todayParams = [...baseParams, dayAgo];
  const todayWhere = `WHERE ${todayConditions.join(" AND ")}`;

  const errorsTodayConditions = [...todayConditions, "level = 'error'"];
  const errorsTodayWhere = `WHERE ${errorsTodayConditions.join(" AND ")}`;

  const recentConditions = [...baseConditions, "level = 'error'"];
  const recentParams = [...baseParams];
  const recentWhere = `WHERE ${recentConditions.join(" AND ")}`;

  const hourlyConditions = [
    ...baseConditions,
    "created_at >= datetime('now', '-24 hours')",
  ];
  const hourlyParams = [...baseParams];
  const hourlyWhere = `WHERE ${hourlyConditions.join(" AND ")}`;

  const total =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM logs ${baseWhere}`,
        baseParams
      )) as { c: number } | undefined
    )?.c ?? 0;

  const totalToday =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM logs ${todayWhere}`,
        todayParams
      )) as { c: number } | undefined
    )?.c ?? 0;

  const errorsToday =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM logs ${errorsTodayWhere}`,
        todayParams
      )) as { c: number } | undefined
    )?.c ?? 0;

  const byLevel = (await database.all<{ level: string; count: number }[]>(
    `SELECT level, COUNT(*) as count FROM logs ${todayWhere} GROUP BY level`,
    todayParams
  )) as { level: string; count: number }[];

  const byService = (await database.all<{ service: string; count: number }[]>(
    `SELECT service, COUNT(*) as count
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}
     GROUP BY service
     ORDER BY count DESC
     LIMIT 10`,
    baseParams
  )) as { service: string; count: number }[];

  const services =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(DISTINCT service) as c
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}`,
        baseParams
      )) as { c: number } | undefined
    )?.c ?? 0;

  const recentErrors = (await database.all<Log[]>(
    `SELECT * FROM logs ${recentWhere} ORDER BY created_at DESC LIMIT 5`,
    recentParams
  )) as Log[];

  const hourlyActivity = (await database.all<{ hour: string; count: number }[]>(
    `SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour
     ORDER BY hour ASC`,
    hourlyParams
  )) as { hour: string; count: number }[];

  const hourlyByLevel = (await database.all<
    { hour: string; level: string; count: number }[]
  >(
    `SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, level, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour, level
     ORDER BY hour ASC`,
    hourlyParams
  )) as { hour: string; level: string; count: number }[];

  return {
    total,
    totalToday,
    errorsToday,
    services,
    byLevel,
    byService,
    recentErrors,
    hourlyActivity,
    hourlyByLevel,
  };
}

export async function getServices(
  allowedServices: string[] | null = null
): Promise<string[]> {
  const database = await getDb();
  const conditions = ["service IS NOT NULL"];
  const params: unknown[] = [];
  addAllowedServicesCondition(conditions, params, allowedServices);
  const rows = (await database.all<{ service: string }[]>(
    `SELECT DISTINCT service
     FROM logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY service`,
    params
  )) as { service: string }[];

  return rows.map((row) => row.service);
}

export async function getLogGroups(
  level: string,
  allowedServices: string[] | null = null
) {
  const database = await getDb();
  const conditions = ["level = ?"];
  const params: unknown[] = [level];
  addAllowedServicesCondition(conditions, params, allowedServices);
  return (await database.all(
    `SELECT message, service, level,
            COUNT(*) as count,
            MAX(created_at) as last_seen,
            MIN(created_at) as first_seen,
            MAX(id) as latest_id
     FROM logs
     WHERE ${conditions.join(" AND ")}
     GROUP BY message, service
     ORDER BY count DESC
     LIMIT 100`,
    params
  )) as {
    message: string;
    service: string | null;
    level: string;
    count: number;
    last_seen: string;
    first_seen: string;
    latest_id: number;
  }[];
}

export async function getErrorGroups(allowedServices: string[] | null = null) {
  const database = await getDb();
  const conditions = ["level = 'error'"];
  const params: unknown[] = [];
  addAllowedServicesCondition(conditions, params, allowedServices);
  return (await database.all(
    `SELECT message, service, level,
            COUNT(*) as count,
            MAX(created_at) as last_seen,
            MIN(created_at) as first_seen,
            MAX(id) as latest_id
     FROM logs
     WHERE ${conditions.join(" AND ")}
     GROUP BY message, service
     ORDER BY count DESC
     LIMIT 100`,
    params
  )) as {
    message: string;
    service: string | null;
    level: string;
    count: number;
    last_seen: string;
    first_seen: string;
    latest_id: number;
  }[];
}

export async function checkAndSetCooldown(
  service: string,
  level: string,
  cooldownMinutes: number
): Promise<boolean> {
  const database = await getDb();
  const row = (await database.get<{ last_sent: string }>(
    "SELECT last_sent FROM alert_cooldowns WHERE service = ? AND level = ?",
    [service, level]
  )) as { last_sent: string } | undefined;

  if (row) {
    const lastSent = new Date(row.last_sent).getTime();
    if (Date.now() - lastSent < cooldownMinutes * 60 * 1000) {
      return false;
    }
  }

  await database.run(
    `INSERT OR REPLACE INTO alert_cooldowns (service, level, last_sent)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    [service, level]
  );

  return true;
}

export async function countRecentLogs(
  level: string,
  service: string | null,
  minutes: number
): Promise<number> {
  const cond = service ? "AND service = ?" : "";
  const args = service ? [level, minutes, service] : [level, minutes];
  const database = await getDb();
  const row = (await database.get<{ c: number }>(
    `SELECT COUNT(*) as c FROM logs
     WHERE level = ?
     AND created_at >= datetime('now', '-' || ? || ' minutes')
     ${cond}`,
    args
  )) as { c: number } | undefined;

  return row?.c ?? 0;
}

export async function deleteOldLogs(days: number): Promise<number> {
  const safeDays = Math.floor(days);
  if (!Number.isFinite(safeDays) || safeDays < 0) {
    throw new Error(`Invalid days value: ${days}`);
  }

  const database = await getDb();
  const result = await database.run(
    "DELETE FROM logs WHERE created_at < datetime('now', '-' || ? || ' days')",
    [safeDays]
  );

  return result.changes ?? 0;
}

export async function exportLogs(
  filters: LogFilters = {},
  allowedServices: string[] | null = null
): Promise<Log[]> {
  const { logs } = await queryLogs(
    { ...filters, limit: 100000, page: 1 },
    allowedServices
  );
  return logs;
}
