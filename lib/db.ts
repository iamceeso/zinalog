import fs from "fs";
import path from "path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import sqlite3 from "sqlite3";
import { open, type Database as SqliteDatabase } from "sqlite";
import {
  decryptSecret,
  encryptSecret,
  SENSITIVE_SETTING_KEYS,
} from "./secret-crypto";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "logs.db");

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

declare global {
  var __dbPromise: Promise<SqliteDatabase> | undefined;
}

let productionDbPromise: Promise<SqliteDatabase> | undefined;

const API_KEY_HASH_PREFIX = "scrypt";
const API_KEY_HASH_BYTES = 64;
const API_KEY_SALT_BYTES = 16;

function createApiKeyLookup(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function hashApiKey(rawKey: string): string {
  const salt = randomBytes(API_KEY_SALT_BYTES).toString("hex");
  const hash = scryptSync(rawKey, salt, API_KEY_HASH_BYTES).toString("hex");
  return `${API_KEY_HASH_PREFIX}$${salt}$${hash}`;
}

function verifyApiKeyHash(rawKey: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHash] = storedHash.split("$");
  if (
    algorithm !== API_KEY_HASH_PREFIX ||
    !salt ||
    !expectedHash ||
    expectedHash.length !== API_KEY_HASH_BYTES * 2 ||
    /[^0-9a-f]/i.test(expectedHash)
  ) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = scryptSync(rawKey, salt, API_KEY_HASH_BYTES);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function withTransaction<T>(
  database: SqliteDatabase,
  action: () => Promise<T>,
): Promise<T> {
  await database.exec("BEGIN IMMEDIATE");

  try {
    const result = await action();
    await database.exec("COMMIT");
    return result;
  } catch (error) {
    await database.exec("ROLLBACK");
    throw error;
  }
}

async function migrateApiKeysTable(database: SqliteDatabase): Promise<void> {
  const columns = (await database.all<{ name: string }[]>(
    "PRAGMA table_info(api_keys)",
  )) as { name: string }[];

  const hasLegacyKey = columns.some((column) => column.name === "key");
  const hasKeyHash = columns.some((column) => column.name === "key_hash");
  const hasKeyLookup = columns.some((column) => column.name === "key_lookup");
  const hasExpiresAt = columns.some((column) => column.name === "expires_at");

  if (!hasLegacyKey && hasKeyHash && hasKeyLookup && hasExpiresAt) {
    return;
  }

  const legacyRows = (await database.all("SELECT * FROM api_keys")) as Array<{
    id: number;
    name: string;
    key?: string | null;
    key_hash?: string | null;
    key_lookup?: string | null;
    service: string | null;
    allowed_ips: string | null;
    rate_limit: number;
    is_active: number;
    created_at: string;
    expires_at?: string | null;
    last_used_at: string | null;
    usage_count: number;
  }>;

  await withTransaction(database, async () => {
    await database.exec(`
      ALTER TABLE api_keys RENAME TO api_keys_legacy;

      CREATE TABLE api_keys (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        key_lookup   TEXT UNIQUE NOT NULL,
        key_hash     TEXT NOT NULL,
        service      TEXT,
        allowed_ips  TEXT,
        rate_limit   INTEGER DEFAULT 1000,
        is_active    INTEGER DEFAULT 1,
        created_at   DATETIME DEFAULT (datetime('now')),
        expires_at   DATETIME,
        last_used_at DATETIME,
        usage_count  INTEGER DEFAULT 0
      );
    `);

    for (const row of legacyRows) {
      let keyLookup = row.key_lookup ?? "";
      let keyHash = row.key_hash ?? "";

      if (!keyLookup || !keyHash) {
        if (!row.key) {
          throw new Error(
            `Unable to migrate API key row ${row.id}: missing legacy key value`,
          );
        }

        keyLookup = createApiKeyLookup(row.key);
        keyHash = hashApiKey(row.key);
      }

      await database.run(
        `INSERT INTO api_keys (
           id, name, key_lookup, key_hash, service, allowed_ips,
           rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name,
          keyLookup,
          keyHash,
          row.service ?? null,
          row.allowed_ips ?? null,
          row.rate_limit,
          row.is_active,
          row.created_at,
          row.expires_at ?? null,
          row.last_used_at ?? null,
          row.usage_count,
        ],
      );
    }

    await database.exec("DROP TABLE api_keys_legacy");
  });
}

async function migrateUsersTable(database: SqliteDatabase): Promise<void> {
  const columns = (await database.all<{ name: string }[]>(
    "PRAGMA table_info(users)",
  )) as { name: string }[];

  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("email")) {
    await database.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!columnNames.has("mfa_enabled")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0",
    );
  }
  if (!columnNames.has("password_is_temporary")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN password_is_temporary INTEGER DEFAULT 0",
    );
  }
  if (!columnNames.has("password_expires_at")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN password_expires_at DATETIME",
    );
  }
  if (!columnNames.has("allowed_services")) {
    await database.exec("ALTER TABLE users ADD COLUMN allowed_services TEXT");
  }

  await database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email)
    WHERE email IS NOT NULL;
  `);
}

async function ensureUsersAllowedServicesColumn(
  database: SqliteDatabase,
): Promise<void> {
  const columns = (await database.all<{ name: string }[]>(
    "PRAGMA table_info(users)",
  )) as { name: string }[];

  if (!columns.some((column) => column.name === "allowed_services")) {
    await database.exec("ALTER TABLE users ADD COLUMN allowed_services TEXT");
  }
}

async function createDb(): Promise<SqliteDatabase> {
  const database = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL,
      message    TEXT NOT NULL,
      service    TEXT,
      stack      TEXT,
      metadata   TEXT,
      api_key_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      key_lookup   TEXT UNIQUE NOT NULL,
      key_hash     TEXT NOT NULL,
      service      TEXT,
      allowed_ips  TEXT,
      rate_limit   INTEGER DEFAULT 1000,
      is_active    INTEGER DEFAULT 1,
      created_at   DATETIME DEFAULT (datetime('now')),
      expires_at   DATETIME,
      last_used_at DATETIME,
      usage_count  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL,
      is_active     INTEGER DEFAULT 1,
      mfa_enabled   INTEGER DEFAULT 0,
      password_is_temporary INTEGER DEFAULT 0,
      password_expires_at DATETIME,
      allowed_services TEXT,
      created_at    DATETIME DEFAULT (datetime('now')),
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      token_hash   TEXT UNIQUE NOT NULL,
      expires_at   DATETIME NOT NULL,
      created_at   DATETIME DEFAULT (datetime('now')),
      last_seen_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_challenges (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      purpose    TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      code_hash  TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_audit_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id    INTEGER,
      actor_username   TEXT,
      subject_user_id  INTEGER,
      subject_username TEXT,
      action           TEXT NOT NULL,
      resource         TEXT,
      ip_address       TEXT,
      user_agent       TEXT,
      details          TEXT,
      created_at       DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_cooldowns (
      service   TEXT NOT NULL,
      level     TEXT NOT NULL,
      last_sent DATETIME NOT NULL,
      PRIMARY KEY (service, level)
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_level      ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_service    ON logs(service);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON auth_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_token_hash ON auth_challenges(token_hash);
    CREATE INDEX IF NOT EXISTS idx_challenges_user_id    ON auth_challenges(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at      ON user_audit_logs(created_at);
  `);

  await migrateApiKeysTable(database);
  await migrateUsersTable(database);

  const defaults: Array<[string, string]> = [
    ["retention_days", "30"],
    ["max_logs", "100000"],
    ["session_idle_timeout_minutes", "30"],
    ["access_audit_enabled", "1"],
    ["access_audit_retention_days", "30"],
    ["email_provider", "disabled"],
    ["email_from", "zinalog@example.com"],
    ["email_to", ""],
    ["smtp_host", ""],
    ["smtp_port", "587"],
    ["smtp_secure", "0"],
    ["smtp_user", ""],
    ["smtp_pass", ""],
    ["resend_api_key", ""],
    ["alert_levels", "error"],
    ["alert_threshold", "1"],
    ["alert_cooldown", "15"],
    ["telegram_enabled", "0"],
    ["telegram_bot_token", ""],
    ["telegram_chat_id", ""],
    ["slack_enabled", "0"],
    ["slack_webhook_url", ""],
    ["discord_enabled", "0"],
    ["discord_webhook_url", ""],
    ["webhook_enabled", "0"],
    ["webhook_url", ""],
    ["webhook_headers", ""],
    ["webhook_method", "POST"],
  ];

  for (const [key, value] of defaults) {
    await database.run(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      [key, value],
    );
  }

  return database;
}

export function getDb(): Promise<SqliteDatabase> {
  if (process.env.NODE_ENV === "production") {
    productionDbPromise ??= createDb();
    return productionDbPromise;
  }

  global.__dbPromise ??= createDb();
  return global.__dbPromise;
}

export interface Log {
  id: number;
  level: string;
  message: string;
  service: string | null;
  stack: string | null;
  metadata: string | null;
  api_key_id: number | null;
  created_at: string;
}

export interface ApiKey {
  id: number;
  name: string;
  key_lookup: string;
  key_hash: string;
  service: string | null;
  allowed_ips: string | null;
  rate_limit: number;
  is_active: number;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
}

export interface ApiKeySummary {
  id: number;
  name: string;
  service: string | null;
  allowed_ips: string | null;
  rate_limit: number;
  is_active: number;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
}

export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  role: UserRole;
  is_active: number;
  mfa_enabled: number;
  password_is_temporary: number;
  password_expires_at: string | null;
  allowed_services: string[] | null;
  created_at: string;
  last_login_at: string | null;
}

export interface UserSummary {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: number;
  mfa_enabled: number;
  password_is_temporary: number;
  password_expires_at: string | null;
  allowed_services: string[] | null;
  created_at: string;
  last_login_at: string | null;
}

export interface AuthSession {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
}

export interface AuthChallenge {
  id: number;
  user_id: number;
  purpose: string;
  token_hash: string;
  code_hash: string | null;
  expires_at: string;
  created_at: string;
}

export interface UserAuditLog {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  subject_user_id: number | null;
  subject_username: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: string | null;
  created_at: string;
}

export interface LogFilters {
  level?: string;
  service?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

interface UserRow extends Omit<User, "allowed_services"> {
  allowed_services: string | null;
}

interface UserSummaryRow extends Omit<UserSummary, "allowed_services"> {
  allowed_services: string | null;
}

function normalizeAllowedServices(
  allowedServices: readonly string[] | null | undefined,
): string[] | null {
  if (allowedServices === undefined || allowedServices === null) {
    return null;
  }

  return Array.from(
    new Set(
      allowedServices
        .map((service) => service.trim())
        .filter((service) => service.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function serializeAllowedServices(
  allowedServices: readonly string[] | null | undefined,
): string | null {
  const normalized = normalizeAllowedServices(allowedServices);
  return normalized === null ? null : JSON.stringify(normalized);
}

function parseAllowedServices(
  rawValue: string | null | undefined,
  context: string,
): string[] | null {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`Invalid allowed services JSON for ${context}`);
  }

  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new Error(`Invalid allowed services value for ${context}`);
  }

  return normalizeAllowedServices(parsed) ?? [];
}

function mapUser(row: UserRow): User {
  return {
    ...row,
    allowed_services: parseAllowedServices(
      row.allowed_services,
      `user ${row.id}`,
    ),
  };
}

function mapUserSummary(row: UserSummaryRow): UserSummary {
  return {
    ...row,
    allowed_services: parseAllowedServices(
      row.allowed_services,
      `user ${row.id}`,
    ),
  };
}

function addAllowedServicesCondition(
  conditions: string[],
  params: unknown[],
  allowedServices: readonly string[] | null | undefined,
): void {
  const normalized = normalizeAllowedServices(allowedServices);

  if (normalized === null) {
    return;
  }

  if (normalized.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  conditions.push(`service IN (${normalized.map(() => "?").join(", ")})`);
  params.push(...normalized);
}

async function getSettingFromDb(
  database: SqliteDatabase,
  key: string,
): Promise<string | null> {
  const row = (await database.get<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key],
  )) as { value: string } | undefined;

  const raw = row?.value ?? null;
  if (raw === null) return null;
  return SENSITIVE_SETTING_KEYS.has(key) ? decryptSecret(raw) : raw;
}

async function getMaxLogsLimitFromDb(
  database: SqliteDatabase,
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
  maxLogs: number,
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
    [safeMaxLogs],
  );

  return result.changes ?? 0;
}

export async function queryLogs(
  filters: LogFilters = {},
  allowedServices: string[] | null = null,
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
    [...params, limit, offset],
  )) as Log[];

  const row = (await database.get<{ total: number }>(
    `SELECT COUNT(*) as total FROM logs ${where}`,
    params,
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
    ],
  );

  await trimLogsToMaxWithDb(database, maxLogs);
  return result.lastID as number;
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
        baseParams,
      )) as { c: number } | undefined
    )?.c ?? 0;

  const totalToday =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM logs ${todayWhere}`,
        todayParams,
      )) as { c: number } | undefined
    )?.c ?? 0;

  const errorsToday =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(*) as c FROM logs ${errorsTodayWhere}`,
        todayParams,
      )) as { c: number } | undefined
    )?.c ?? 0;

  const byLevel = (await database.all<{ level: string; count: number }[]>(
    `SELECT level, COUNT(*) as count FROM logs ${todayWhere} GROUP BY level`,
    todayParams,
  )) as { level: string; count: number }[];

  const byService = (await database.all<{ service: string; count: number }[]>(
    `SELECT service, COUNT(*) as count
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}
     GROUP BY service
     ORDER BY count DESC
     LIMIT 10`,
    baseParams,
  )) as { service: string; count: number }[];

  const services =
    (
      (await database.get<{ c: number }>(
        `SELECT COUNT(DISTINCT service) as c
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}`,
        baseParams,
      )) as { c: number } | undefined
    )?.c ?? 0;

  const recentErrors = (await database.all<Log[]>(
    `SELECT * FROM logs ${recentWhere} ORDER BY created_at DESC LIMIT 5`,
    recentParams,
  )) as Log[];

  const hourlyActivity = (await database.all<{ hour: string; count: number }[]>(
    `SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour
     ORDER BY hour ASC`,
    hourlyParams,
  )) as { hour: string; count: number }[];

  const hourlyByLevel = (await database.all<
    { hour: string; level: string; count: number }[]
  >(
    `SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, level, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour, level
     ORDER BY hour ASC`,
    hourlyParams,
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
  allowedServices: string[] | null = null,
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
    params,
  )) as { service: string }[];

  return rows.map((row) => row.service);
}

export async function getLogGroups(
  level: string,
  allowedServices: string[] | null = null,
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
    params,
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
    params,
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

export async function getApiKey(key: string): Promise<ApiKey | null> {
  const keyLookup = createApiKeyLookup(key);
  const database = await getDb();
  const apiKey =
    ((await database.get<ApiKey>(
      "SELECT * FROM api_keys WHERE key_lookup = ? AND is_active = 1",
      [keyLookup],
    )) as ApiKey | undefined) ?? null;

  if (!apiKey || !verifyApiKeyHash(key, apiKey.key_hash)) {
    return null;
  }

  return apiKey;
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const database = await getDb();
  return (await database.all<ApiKeySummary[]>(
    `SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     ORDER BY created_at DESC`,
  )) as ApiKeySummary[];
}

export async function createApiKey(data: {
  name: string;
  rawKey: string;
  service?: string | null;
  allowed_ips?: string | null;
  rate_limit?: number;
  expires_at?: string | null;
}): Promise<ApiKeySummary> {
  const keyLookup = createApiKeyLookup(data.rawKey);
  const keyHash = hashApiKey(data.rawKey);
  const database = await getDb();
  const result = await database.run(
    `INSERT INTO api_keys (name, key_lookup, key_hash, service, allowed_ips, rate_limit, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      keyLookup,
      keyHash,
      data.service ?? null,
      data.allowed_ips ?? null,
      data.rate_limit ?? 1000,
      data.expires_at ?? null,
    ],
  );

  const created = (await database.get<ApiKeySummary>(
    `SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     WHERE id = ?`,
    [result.lastID],
  )) as ApiKeySummary | undefined;

  if (!created) {
    throw new Error("Failed to load created API key");
  }

  return created;
}

export async function deleteApiKey(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("DELETE FROM api_keys WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

export async function revokeApiKey(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE api_keys SET is_active = 0 WHERE id = ?",
    [id],
  );
  return (result.changes ?? 0) > 0;
}

export async function touchApiKey(id: number): Promise<void> {
  const database = await getDb();
  await database.run(
    "UPDATE api_keys SET last_used_at = datetime('now'), usage_count = usage_count + 1 WHERE id = ?",
    [id],
  );
}

export async function getSetting(key: string): Promise<string | null> {
  return getSettingFromDb(await getDb(), key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  const stored = SENSITIVE_SETTING_KEYS.has(key) ? encryptSecret(value) : value;
  await database.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, stored],
  );
}

export async function setSettings(
  pairs: Record<string, string>,
): Promise<void> {
  const database = await getDb();

  await withTransaction(database, async () => {
    for (const [key, value] of Object.entries(pairs)) {
      const stored = SENSITIVE_SETTING_KEYS.has(key) ? encryptSecret(value) : value;
      await database.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, stored],
      );
    }
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const database = await getDb();
  const rows = (await database.all<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  )) as { key: string; value: string }[];

  return Object.fromEntries(
    rows.map((row) => [
      row.key,
      SENSITIVE_SETTING_KEYS.has(row.key)
        ? decryptSecret(row.value)
        : row.value,
    ]),
  );
}

async function parsePositiveSetting(
  key: string,
  fallback: number,
): Promise<number> {
  const rawValue = await getSetting(key);
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.floor(parsedValue);
}

export async function isAccessAuditEnabled(): Promise<boolean> {
  return (await getSetting("access_audit_enabled")) !== "0";
}

export async function getSessionIdleTimeoutMinutes(): Promise<number> {
  return parsePositiveSetting("session_idle_timeout_minutes", 30);
}

export async function getAccessAuditRetentionDays(): Promise<number> {
  return parsePositiveSetting("access_audit_retention_days", 30);
}

export async function checkAndSetCooldown(
  service: string,
  level: string,
  cooldownMinutes: number,
): Promise<boolean> {
  const database = await getDb();
  const row = (await database.get<{ last_sent: string }>(
    "SELECT last_sent FROM alert_cooldowns WHERE service = ? AND level = ?",
    [service, level],
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
    [service, level],
  );

  return true;
}

export async function countRecentLogs(
  level: string,
  service: string | null,
  minutes: number,
): Promise<number> {
  const cond = service ? "AND service = ?" : "";
  const args = service ? [level, minutes, service] : [level, minutes];
  const database = await getDb();
  const row = (await database.get<{ c: number }>(
    `SELECT COUNT(*) as c FROM logs
     WHERE level = ?
     AND created_at >= datetime('now', '-' || ? || ' minutes')
     ${cond}`,
    args,
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
    [safeDays],
  );

  return result.changes ?? 0;
}

export async function exportLogs(
  filters: LogFilters = {},
  allowedServices: string[] | null = null,
): Promise<Log[]> {
  const { logs } = await queryLogs(
    { ...filters, limit: 100000, page: 1 },
    allowedServices,
  );
  return logs;
}

export async function countUsers(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>("SELECT COUNT(*) as c FROM users")) as
        | { c: number }
        | undefined
    )?.c ?? 0
  );
}

export async function countActiveAdmins(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1",
      )) as { c: number } | undefined
    )?.c ?? 0
  );
}

export async function countAdmins(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin'",
      )) as { c: number } | undefined
    )?.c ?? 0
  );
}

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserRow>(
    "SELECT * FROM users WHERE username = ?",
    [username],
  )) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserRow>(
    "SELECT * FROM users WHERE email = ?",
    [email],
  )) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function getUserById(id: number): Promise<User | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserRow>("SELECT * FROM users WHERE id = ?", [
    id,
  ])) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function listUsers(): Promise<UserSummary[]> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const rows = (await database.all<UserSummaryRow[]>(
    `SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
            password_expires_at, allowed_services, created_at, last_login_at
     FROM users
     ORDER BY created_at ASC`,
  )) as UserSummaryRow[];

  return rows.map((row) => mapUserSummary(row));
}

export async function createUser(data: {
  username: string;
  email?: string | null;
  password_hash: string;
  role: UserRole;
  mfa_enabled?: boolean;
  password_is_temporary?: boolean;
  password_expires_at?: string | null;
  allowed_services?: string[] | null;
}): Promise<UserSummary> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const result = await database.run(
    `INSERT INTO users (
       username, email, password_hash, role, mfa_enabled, password_is_temporary, password_expires_at,
       allowed_services
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.username,
      data.email ?? null,
      data.password_hash,
      data.role,
      data.mfa_enabled ? 1 : 0,
      data.password_is_temporary ? 1 : 0,
      data.password_expires_at ?? null,
      serializeAllowedServices(data.allowed_services),
    ],
  );

  const created = (await database.get<UserSummaryRow>(
    `SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
            password_expires_at, allowed_services, created_at, last_login_at
     FROM users
     WHERE id = ?`,
    [result.lastID],
  )) as UserSummaryRow | undefined;

  if (!created) {
    throw new Error("Failed to load created user");
  }

  return mapUserSummary(created);
}

export async function updateUserRole(
  id: number,
  role: UserRole,
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("UPDATE users SET role = ? WHERE id = ?", [
    role,
    id,
  ]);
  return (result.changes ?? 0) > 0;
}

export async function updateUserPassword(
  id: number,
  passwordHash: string,
  options?: {
    password_is_temporary?: boolean;
    password_expires_at?: string | null;
  },
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    `UPDATE users
     SET password_hash = ?,
         password_is_temporary = ?,
         password_expires_at = ?
     WHERE id = ?`,
    [
      passwordHash,
      options?.password_is_temporary ? 1 : 0,
      options?.password_expires_at ?? null,
      id,
    ],
  );

  return (result.changes ?? 0) > 0;
}

export async function updateUserEmail(
  id: number,
  email: string | null,
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("UPDATE users SET email = ? WHERE id = ?", [
    email,
    id,
  ]);
  return (result.changes ?? 0) > 0;
}

export async function updateUserAllowedServices(
  id: number,
  allowedServices: string[] | null,
): Promise<boolean> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const result = await database.run(
    "UPDATE users SET allowed_services = ? WHERE id = ?",
    [serializeAllowedServices(allowedServices), id],
  );
  return (result.changes ?? 0) > 0;
}

export async function updateUserMfaEnabled(
  id: number,
  enabled: boolean,
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE users SET mfa_enabled = ? WHERE id = ?",
    [enabled ? 1 : 0, id],
  );

  return (result.changes ?? 0) > 0;
}

export async function setUserActive(
  id: number,
  isActive: boolean,
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE users SET is_active = ? WHERE id = ?",
    [isActive ? 1 : 0, id],
  );

  return (result.changes ?? 0) > 0;
}

export async function touchUserLogin(id: number): Promise<void> {
  const database = await getDb();
  await database.run(
    "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
    [id],
  );
}

export async function createAuthSession(data: {
  user_id: number;
  token_hash: string;
  expires_at: string;
}): Promise<AuthSession> {
  const database = await getDb();
  const result = await database.run(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [data.user_id, data.token_hash, data.expires_at],
  );

  const session = (await database.get<AuthSession>(
    "SELECT * FROM auth_sessions WHERE id = ?",
    [result.lastID],
  )) as AuthSession | undefined;

  if (!session) {
    throw new Error("Failed to load created session");
  }

  return session;
}

export async function getUserBySessionTokenHash(
  tokenHash: string,
): Promise<UserSummary | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserSummaryRow>(
    `SELECT u.id, u.username, u.email, u.role, u.is_active, u.mfa_enabled,
              u.password_is_temporary, u.password_expires_at, u.allowed_services,
              u.created_at, u.last_login_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
           AND datetime(s.expires_at) > datetime('now')
           AND u.is_active = 1`,
    [tokenHash],
  )) as UserSummaryRow | undefined;
  return row ? mapUserSummary(row) : null;
}

export async function createAuthChallenge(data: {
  user_id: number;
  purpose: string;
  token_hash: string;
  code_hash?: string | null;
  expires_at: string;
}): Promise<AuthChallenge> {
  const database = await getDb();
  const result = await database.run(
    `INSERT INTO auth_challenges (user_id, purpose, token_hash, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.purpose,
      data.token_hash,
      data.code_hash ?? null,
      data.expires_at,
    ],
  );

  const challenge = (await database.get<AuthChallenge>(
    "SELECT * FROM auth_challenges WHERE id = ?",
    [result.lastID],
  )) as AuthChallenge | undefined;

  if (!challenge) {
    throw new Error("Failed to load created auth challenge");
  }

  return challenge;
}

export async function getAuthChallengeByTokenHash(
  tokenHash: string,
  purpose?: string,
): Promise<AuthChallenge | null> {
  const database = await getDb();
  const query = purpose
    ? `SELECT * FROM auth_challenges
       WHERE token_hash = ?
         AND purpose = ?
         AND datetime(expires_at) > datetime('now')`
    : `SELECT * FROM auth_challenges
       WHERE token_hash = ?
         AND datetime(expires_at) > datetime('now')`;

  return (
    ((await database.get<AuthChallenge>(
      query,
      purpose ? [tokenHash, purpose] : [tokenHash],
    )) as AuthChallenge | undefined) ?? null
  );
}

export async function deleteAuthChallenge(tokenHash: string): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE token_hash = ?",
    [tokenHash],
  );

  return (result.changes ?? 0) > 0;
}

export async function deleteAuthChallengesForUser(
  userId: number,
): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE user_id = ?",
    [userId],
  );
  return result.changes ?? 0;
}

export async function cleanupExpiredAuthChallenges(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE datetime(expires_at) <= datetime('now')",
  );

  return result.changes ?? 0;
}

export async function deleteAuthSession(tokenHash: string): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE token_hash = ?",
    [tokenHash],
  );

  return (result.changes ?? 0) > 0;
}

export async function deleteAuthSessionsForUser(
  userId: number,
): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE user_id = ?",
    [userId],
  );
  return result.changes ?? 0;
}

export async function touchAuthSession(
  tokenHash: string,
  idleTimeoutMinutes: number,
): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE auth_sessions
     SET last_seen_at = datetime('now'),
         expires_at = datetime('now', '+' || ? || ' minutes')
     WHERE token_hash = ?`,
    [idleTimeoutMinutes, tokenHash],
  );
}

export async function cleanupExpiredAuthSessions(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')",
  );

  return result.changes ?? 0;
}

export async function deleteUser(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("DELETE FROM users WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

export async function createUserAuditLog(data: {
  actor_user_id?: number | null;
  actor_username?: string | null;
  subject_user_id?: number | null;
  subject_username?: string | null;
  action: string;
  resource?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: string | null;
}): Promise<UserAuditLog> {
  if (data.action === "page_access" && !(await isAccessAuditEnabled())) {
    throw new Error("Access auditing is disabled");
  }

  const database = await getDb();
  const result = await database.run(
    `INSERT INTO user_audit_logs (
       actor_user_id, actor_username, subject_user_id, subject_username,
       action, resource, ip_address, user_agent, details
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.actor_user_id ?? null,
      data.actor_username ?? null,
      data.subject_user_id ?? null,
      data.subject_username ?? null,
      data.action,
      data.resource ?? null,
      data.ip_address ?? null,
      data.user_agent ?? null,
      data.details ?? null,
    ],
  );

  if (data.action === "page_access") {
    await deleteUserAccessAuditLogsOlderThan(
      await getAccessAuditRetentionDays(),
    );
  }

  const auditLog = (await database.get<UserAuditLog>(
    "SELECT * FROM user_audit_logs WHERE id = ?",
    [result.lastID],
  )) as UserAuditLog | undefined;

  if (!auditLog) {
    throw new Error("Failed to load created audit log");
  }

  return auditLog;
}

export async function listUserAuditLogs(limit = 100): Promise<UserAuditLog[]> {
  const database = await getDb();
  return (await database.all<UserAuditLog[]>(
    `SELECT *
     FROM user_audit_logs
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit],
  )) as UserAuditLog[];
}

export async function listUserAccessAuditLogs(
  limit = 100,
): Promise<UserAuditLog[]> {
  const database = await getDb();
  return (await database.all<UserAuditLog[]>(
    `SELECT *
     FROM user_audit_logs
     WHERE action = 'page_access'
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit],
  )) as UserAuditLog[];
}

export async function deleteUserAccessAuditLogsOlderThan(
  days: number,
): Promise<number> {
  const safeDays = Math.floor(days);
  if (!Number.isFinite(safeDays) || safeDays < 1) {
    throw new Error(`Invalid days value: ${days}`);
  }

  const database = await getDb();
  const result = await database.run(
    `DELETE FROM user_audit_logs
     WHERE action = 'page_access'
     AND created_at < datetime('now', '-' || ? || ' days')`,
    [safeDays],
  );

  return result.changes ?? 0;
}

export async function deleteAllUserAccessAuditLogs(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM user_audit_logs WHERE action = 'page_access'",
  );

  return result.changes ?? 0;
}
