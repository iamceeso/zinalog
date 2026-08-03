import fs from "fs";
import path from "path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import sqlite3 from "sqlite3";
import { open, type Database as SqliteDatabase } from "sqlite";
import { runPendingMigrations } from "../migrations";

export type { SqliteDatabase };

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

export function createApiKeyLookup(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function hashApiKey(rawKey: string): string {
  const salt = randomBytes(API_KEY_SALT_BYTES).toString("hex");
  const hash = scryptSync(rawKey, salt, API_KEY_HASH_BYTES).toString("hex");
  return `${API_KEY_HASH_PREFIX}$${salt}$${hash}`;
}

export function verifyApiKeyHash(rawKey: string, storedHash: string): boolean {
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

export async function withTransaction<T>(
  database: SqliteDatabase,
  action: () => Promise<T>
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
    "PRAGMA table_info(api_keys)"
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
            `Unable to migrate API key row ${row.id}: missing legacy key value`
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
        ]
      );
    }

    await database.exec("DROP TABLE api_keys_legacy");
  });
}

async function migrateUsersTable(database: SqliteDatabase): Promise<void> {
  const columns = (await database.all<{ name: string }[]>(
    "PRAGMA table_info(users)"
  )) as { name: string }[];

  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("email")) {
    await database.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!columnNames.has("mfa_enabled")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0"
    );
  }
  if (!columnNames.has("password_is_temporary")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN password_is_temporary INTEGER DEFAULT 0"
    );
  }
  if (!columnNames.has("password_expires_at")) {
    await database.exec(
      "ALTER TABLE users ADD COLUMN password_expires_at DATETIME"
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
  await runPendingMigrations(database);

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
      [key, value]
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

export function normalizeAllowedServices(
  allowedServices: readonly string[] | null | undefined
): string[] | null {
  if (allowedServices === undefined || allowedServices === null) {
    return null;
  }

  return Array.from(
    new Set(
      allowedServices
        .map((service) => service.trim())
        .filter((service) => service.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
}

export function serializeAllowedServices(
  allowedServices: readonly string[] | null | undefined
): string | null {
  const normalized = normalizeAllowedServices(allowedServices);
  return normalized === null ? null : JSON.stringify(normalized);
}

export function parseAllowedServices(
  rawValue: string | null | undefined,
  context: string
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

export function addAllowedServicesCondition(
  conditions: string[],
  params: unknown[],
  allowedServices: readonly string[] | null | undefined
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
