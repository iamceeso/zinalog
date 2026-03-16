"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.queryLogs = queryLogs;
exports.insertLog = insertLog;
exports.trimLogsToMax = trimLogsToMax;
exports.getStats = getStats;
exports.getServices = getServices;
exports.getLogGroups = getLogGroups;
exports.getErrorGroups = getErrorGroups;
exports.getApiKey = getApiKey;
exports.listApiKeys = listApiKeys;
exports.createApiKey = createApiKey;
exports.deleteApiKey = deleteApiKey;
exports.revokeApiKey = revokeApiKey;
exports.touchApiKey = touchApiKey;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.setSettings = setSettings;
exports.getAllSettings = getAllSettings;
exports.isAccessAuditEnabled = isAccessAuditEnabled;
exports.getSessionIdleTimeoutMinutes = getSessionIdleTimeoutMinutes;
exports.getAccessAuditRetentionDays = getAccessAuditRetentionDays;
exports.checkAndSetCooldown = checkAndSetCooldown;
exports.countRecentLogs = countRecentLogs;
exports.deleteOldLogs = deleteOldLogs;
exports.exportLogs = exportLogs;
exports.countUsers = countUsers;
exports.countActiveAdmins = countActiveAdmins;
exports.countAdmins = countAdmins;
exports.getUserByUsername = getUserByUsername;
exports.getUserByEmail = getUserByEmail;
exports.getUserById = getUserById;
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUserRole = updateUserRole;
exports.updateUserPassword = updateUserPassword;
exports.updateUserEmail = updateUserEmail;
exports.updateUserAllowedServices = updateUserAllowedServices;
exports.updateUserMfaEnabled = updateUserMfaEnabled;
exports.setUserActive = setUserActive;
exports.touchUserLogin = touchUserLogin;
exports.createAuthSession = createAuthSession;
exports.getUserBySessionTokenHash = getUserBySessionTokenHash;
exports.createAuthChallenge = createAuthChallenge;
exports.getAuthChallengeByTokenHash = getAuthChallengeByTokenHash;
exports.deleteAuthChallenge = deleteAuthChallenge;
exports.deleteAuthChallengesForUser = deleteAuthChallengesForUser;
exports.cleanupExpiredAuthChallenges = cleanupExpiredAuthChallenges;
exports.deleteAuthSession = deleteAuthSession;
exports.deleteAuthSessionsForUser = deleteAuthSessionsForUser;
exports.touchAuthSession = touchAuthSession;
exports.cleanupExpiredAuthSessions = cleanupExpiredAuthSessions;
exports.deleteUser = deleteUser;
exports.createUserAuditLog = createUserAuditLog;
exports.listUserAuditLogs = listUserAuditLogs;
exports.listUserAccessAuditLogs = listUserAccessAuditLogs;
exports.deleteUserAccessAuditLogsOlderThan = deleteUserAccessAuditLogsOlderThan;
exports.deleteAllUserAccessAuditLogs = deleteAllUserAccessAuditLogs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const DB_PATH = process.env.DATABASE_PATH ||
    path_1.default.join(process.cwd(), "data", "logs.db");
const dbDir = path_1.default.dirname(DB_PATH);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
let productionDbPromise;
const API_KEY_HASH_PREFIX = "scrypt";
const API_KEY_HASH_BYTES = 64;
const API_KEY_SALT_BYTES = 16;
function createApiKeyLookup(rawKey) {
    return (0, crypto_1.createHash)("sha256").update(rawKey).digest("hex");
}
function hashApiKey(rawKey) {
    const salt = (0, crypto_1.randomBytes)(API_KEY_SALT_BYTES).toString("hex");
    const hash = (0, crypto_1.scryptSync)(rawKey, salt, API_KEY_HASH_BYTES).toString("hex");
    return `${API_KEY_HASH_PREFIX}$${salt}$${hash}`;
}
function verifyApiKeyHash(rawKey, storedHash) {
    const [algorithm, salt, expectedHash] = storedHash.split("$");
    if (algorithm !== API_KEY_HASH_PREFIX ||
        !salt ||
        !expectedHash ||
        expectedHash.length !== API_KEY_HASH_BYTES * 2 ||
        /[^0-9a-f]/i.test(expectedHash)) {
        return false;
    }
    const expected = Buffer.from(expectedHash, "hex");
    const actual = (0, crypto_1.scryptSync)(rawKey, salt, API_KEY_HASH_BYTES);
    return expected.length === actual.length && (0, crypto_1.timingSafeEqual)(expected, actual);
}
async function withTransaction(database, action) {
    await database.exec("BEGIN IMMEDIATE");
    try {
        const result = await action();
        await database.exec("COMMIT");
        return result;
    }
    catch (error) {
        await database.exec("ROLLBACK");
        throw error;
    }
}
async function migrateApiKeysTable(database) {
    const columns = (await database.all("PRAGMA table_info(api_keys)"));
    const hasLegacyKey = columns.some((column) => column.name === "key");
    const hasKeyHash = columns.some((column) => column.name === "key_hash");
    const hasKeyLookup = columns.some((column) => column.name === "key_lookup");
    const hasExpiresAt = columns.some((column) => column.name === "expires_at");
    if (!hasLegacyKey && hasKeyHash && hasKeyLookup && hasExpiresAt) {
        return;
    }
    const legacyRows = (await database.all("SELECT * FROM api_keys"));
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
                    throw new Error(`Unable to migrate API key row ${row.id}: missing legacy key value`);
                }
                keyLookup = createApiKeyLookup(row.key);
                keyHash = hashApiKey(row.key);
            }
            await database.run(`INSERT INTO api_keys (
           id, name, key_lookup, key_hash, service, allowed_ips,
           rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
        }
        await database.exec("DROP TABLE api_keys_legacy");
    });
}
async function migrateUsersTable(database) {
    const columns = (await database.all("PRAGMA table_info(users)"));
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("email")) {
        await database.exec("ALTER TABLE users ADD COLUMN email TEXT");
    }
    if (!columnNames.has("mfa_enabled")) {
        await database.exec("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0");
    }
    if (!columnNames.has("password_is_temporary")) {
        await database.exec("ALTER TABLE users ADD COLUMN password_is_temporary INTEGER DEFAULT 0");
    }
    if (!columnNames.has("password_expires_at")) {
        await database.exec("ALTER TABLE users ADD COLUMN password_expires_at DATETIME");
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
async function ensureUsersAllowedServicesColumn(database) {
    const columns = (await database.all("PRAGMA table_info(users)"));
    if (!columns.some((column) => column.name === "allowed_services")) {
        await database.exec("ALTER TABLE users ADD COLUMN allowed_services TEXT");
    }
}
async function createDb() {
    const database = await (0, sqlite_1.open)({
        filename: DB_PATH,
        driver: sqlite3_1.default.Database,
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
    const defaults = [
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
        await database.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    }
    return database;
}
function getDb() {
    if (process.env.NODE_ENV === "production") {
        productionDbPromise ?? (productionDbPromise = createDb());
        return productionDbPromise;
    }
    global.__dbPromise ?? (global.__dbPromise = createDb());
    return global.__dbPromise;
}
function normalizeAllowedServices(allowedServices) {
    if (allowedServices === undefined || allowedServices === null) {
        return null;
    }
    return Array.from(new Set(allowedServices
        .map((service) => service.trim())
        .filter((service) => service.length > 0))).sort((left, right) => left.localeCompare(right));
}
function serializeAllowedServices(allowedServices) {
    const normalized = normalizeAllowedServices(allowedServices);
    return normalized === null ? null : JSON.stringify(normalized);
}
function parseAllowedServices(rawValue, context) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(rawValue);
    }
    catch {
        throw new Error(`Invalid allowed services JSON for ${context}`);
    }
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
        throw new Error(`Invalid allowed services value for ${context}`);
    }
    return normalizeAllowedServices(parsed) ?? [];
}
function mapUser(row) {
    return {
        ...row,
        allowed_services: parseAllowedServices(row.allowed_services, `user ${row.id}`),
    };
}
function mapUserSummary(row) {
    return {
        ...row,
        allowed_services: parseAllowedServices(row.allowed_services, `user ${row.id}`),
    };
}
function addAllowedServicesCondition(conditions, params, allowedServices) {
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
async function getSettingFromDb(database, key) {
    const row = (await database.get("SELECT value FROM settings WHERE key = ?", [key]));
    return row?.value ?? null;
}
async function getMaxLogsLimitFromDb(database) {
    const rawValue = await getSettingFromDb(database, "max_logs");
    const parsedValue = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
        return 100000;
    }
    return Math.floor(parsedValue);
}
async function trimLogsToMaxWithDb(database, maxLogs) {
    const safeMaxLogs = Math.floor(maxLogs);
    if (!Number.isFinite(safeMaxLogs) || safeMaxLogs < 1) {
        throw new Error(`Invalid max_logs value: ${maxLogs}`);
    }
    const result = await database.run(`DELETE FROM logs
     WHERE id IN (
       SELECT id
       FROM logs
       ORDER BY created_at DESC, id DESC
       LIMIT -1 OFFSET ?
     )`, [safeMaxLogs]);
    return result.changes ?? 0;
}
async function queryLogs(filters = {}, allowedServices = null) {
    const { level, service, search, from, to, page = 1, limit = 50 } = filters;
    const conditions = [];
    const params = [];
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
    const logs = (await database.all(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]));
    const row = (await database.get(`SELECT COUNT(*) as total FROM logs ${where}`, params));
    return { logs, total: row?.total ?? 0 };
}
async function insertLog(data) {
    const database = await getDb();
    const maxLogs = await getMaxLogsLimitFromDb(database);
    return withTransaction(database, async () => {
        const result = await database.run(`INSERT INTO logs (level, message, service, stack, metadata, api_key_id)
       VALUES (?, ?, ?, ?, ?, ?)`, [
            data.level,
            data.message,
            data.service ?? null,
            data.stack ?? null,
            data.metadata ?? null,
            data.api_key_id ?? null,
        ]);
        await trimLogsToMaxWithDb(database, maxLogs);
        return result.lastID;
    });
}
async function trimLogsToMax(maxLogs) {
    return trimLogsToMaxWithDb(await getDb(), maxLogs);
}
async function getStats(allowedServices = null) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const database = await getDb();
    const baseConditions = [];
    const baseParams = [];
    addAllowedServicesCondition(baseConditions, baseParams, allowedServices);
    const baseWhere = baseConditions.length ? `WHERE ${baseConditions.join(" AND ")}` : "";
    const todayConditions = [...baseConditions, "created_at >= ?"];
    const todayParams = [...baseParams, dayAgo];
    const todayWhere = `WHERE ${todayConditions.join(" AND ")}`;
    const errorsTodayConditions = [...todayConditions, "level = 'error'"];
    const errorsTodayWhere = `WHERE ${errorsTodayConditions.join(" AND ")}`;
    const recentConditions = [...baseConditions, "level = 'error'"];
    const recentParams = [...baseParams];
    const recentWhere = `WHERE ${recentConditions.join(" AND ")}`;
    const hourlyConditions = [...baseConditions, "created_at >= datetime('now', '-24 hours')"];
    const hourlyParams = [...baseParams];
    const hourlyWhere = `WHERE ${hourlyConditions.join(" AND ")}`;
    const total = (await database.get(`SELECT COUNT(*) as c FROM logs ${baseWhere}`, baseParams))?.c ?? 0;
    const totalToday = (await database.get(`SELECT COUNT(*) as c FROM logs ${todayWhere}`, todayParams))?.c ?? 0;
    const errorsToday = (await database.get(`SELECT COUNT(*) as c FROM logs ${errorsTodayWhere}`, todayParams))?.c ?? 0;
    const byLevel = (await database.all(`SELECT level, COUNT(*) as count FROM logs ${todayWhere} GROUP BY level`, todayParams));
    const byService = (await database.all(`SELECT service, COUNT(*) as count
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}
     GROUP BY service
     ORDER BY count DESC
     LIMIT 10`, baseParams));
    const services = (await database.get(`SELECT COUNT(DISTINCT service) as c
     FROM logs
     ${baseWhere ? `${baseWhere} AND service IS NOT NULL` : "WHERE service IS NOT NULL"}`, baseParams))?.c ?? 0;
    const recentErrors = (await database.all(`SELECT * FROM logs ${recentWhere} ORDER BY created_at DESC LIMIT 5`, recentParams));
    const hourlyActivity = (await database.all(`SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour
     ORDER BY hour ASC`, hourlyParams));
    const hourlyByLevel = (await database.all(`SELECT strftime('%Y-%m-%dT%H:00:00', created_at) as hour, level, COUNT(*) as count
     FROM logs
     ${hourlyWhere}
     GROUP BY hour, level
     ORDER BY hour ASC`, hourlyParams));
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
async function getServices(allowedServices = null) {
    const database = await getDb();
    const conditions = ["service IS NOT NULL"];
    const params = [];
    addAllowedServicesCondition(conditions, params, allowedServices);
    const rows = (await database.all(`SELECT DISTINCT service
     FROM logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY service`, params));
    return rows.map((row) => row.service);
}
async function getLogGroups(level, allowedServices = null) {
    const database = await getDb();
    const conditions = ["level = ?"];
    const params = [level];
    addAllowedServicesCondition(conditions, params, allowedServices);
    return (await database.all(`SELECT message, service, level,
            COUNT(*) as count,
            MAX(created_at) as last_seen,
            MIN(created_at) as first_seen,
            MAX(id) as latest_id
     FROM logs
     WHERE ${conditions.join(" AND ")}
     GROUP BY message, service
     ORDER BY count DESC
     LIMIT 100`, params));
}
async function getErrorGroups(allowedServices = null) {
    const database = await getDb();
    const conditions = ["level = 'error'"];
    const params = [];
    addAllowedServicesCondition(conditions, params, allowedServices);
    return (await database.all(`SELECT message, service, level,
            COUNT(*) as count,
            MAX(created_at) as last_seen,
            MIN(created_at) as first_seen,
            MAX(id) as latest_id
     FROM logs
     WHERE ${conditions.join(" AND ")}
     GROUP BY message, service
     ORDER BY count DESC
     LIMIT 100`, params));
}
async function getApiKey(key) {
    const keyLookup = createApiKeyLookup(key);
    const database = await getDb();
    const apiKey = (await database.get("SELECT * FROM api_keys WHERE key_lookup = ? AND is_active = 1", [keyLookup])) ?? null;
    if (!apiKey || !verifyApiKeyHash(key, apiKey.key_hash)) {
        return null;
    }
    return apiKey;
}
async function listApiKeys() {
    const database = await getDb();
    return (await database.all(`SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     ORDER BY created_at DESC`));
}
async function createApiKey(data) {
    const keyLookup = createApiKeyLookup(data.rawKey);
    const keyHash = hashApiKey(data.rawKey);
    const database = await getDb();
    const result = await database.run(`INSERT INTO api_keys (name, key_lookup, key_hash, service, allowed_ips, rate_limit, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        data.name,
        keyLookup,
        keyHash,
        data.service ?? null,
        data.allowed_ips ?? null,
        data.rate_limit ?? 1000,
        data.expires_at ?? null,
    ]);
    const created = (await database.get(`SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     WHERE id = ?`, [result.lastID]));
    if (!created) {
        throw new Error("Failed to load created API key");
    }
    return created;
}
async function deleteApiKey(id) {
    const database = await getDb();
    const result = await database.run("DELETE FROM api_keys WHERE id = ?", [id]);
    return (result.changes ?? 0) > 0;
}
async function revokeApiKey(id) {
    const database = await getDb();
    const result = await database.run("UPDATE api_keys SET is_active = 0 WHERE id = ?", [id]);
    return (result.changes ?? 0) > 0;
}
async function touchApiKey(id) {
    const database = await getDb();
    await database.run("UPDATE api_keys SET last_used_at = datetime('now'), usage_count = usage_count + 1 WHERE id = ?", [id]);
}
async function getSetting(key) {
    return getSettingFromDb(await getDb(), key);
}
async function setSetting(key, value) {
    const database = await getDb();
    await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}
async function setSettings(pairs) {
    const database = await getDb();
    await withTransaction(database, async () => {
        for (const [key, value] of Object.entries(pairs)) {
            await database.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
        }
    });
}
async function getAllSettings() {
    const database = await getDb();
    const rows = (await database.all("SELECT key, value FROM settings"));
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
async function parsePositiveSetting(key, fallback) {
    const rawValue = await getSetting(key);
    const parsedValue = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
        return fallback;
    }
    return Math.floor(parsedValue);
}
async function isAccessAuditEnabled() {
    return (await getSetting("access_audit_enabled")) !== "0";
}
async function getSessionIdleTimeoutMinutes() {
    return parsePositiveSetting("session_idle_timeout_minutes", 30);
}
async function getAccessAuditRetentionDays() {
    return parsePositiveSetting("access_audit_retention_days", 30);
}
async function checkAndSetCooldown(service, level, cooldownMinutes) {
    const database = await getDb();
    const row = (await database.get("SELECT last_sent FROM alert_cooldowns WHERE service = ? AND level = ?", [service, level]));
    if (row) {
        const lastSent = new Date(row.last_sent).getTime();
        if (Date.now() - lastSent < cooldownMinutes * 60 * 1000) {
            return false;
        }
    }
    await database.run(`INSERT OR REPLACE INTO alert_cooldowns (service, level, last_sent)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`, [service, level]);
    return true;
}
async function countRecentLogs(level, service, minutes) {
    const cond = service ? "AND service = ?" : "";
    const args = service ? [level, minutes, service] : [level, minutes];
    const database = await getDb();
    const row = (await database.get(`SELECT COUNT(*) as c FROM logs
     WHERE level = ?
     AND created_at >= datetime('now', '-' || ? || ' minutes')
     ${cond}`, args));
    return row?.c ?? 0;
}
async function deleteOldLogs(days) {
    const safeDays = Math.floor(days);
    if (!Number.isFinite(safeDays) || safeDays < 0) {
        throw new Error(`Invalid days value: ${days}`);
    }
    const database = await getDb();
    const result = await database.run("DELETE FROM logs WHERE created_at < datetime('now', '-' || ? || ' days')", [safeDays]);
    return result.changes ?? 0;
}
async function exportLogs(filters = {}, allowedServices = null) {
    const { logs } = await queryLogs({ ...filters, limit: 100000, page: 1 }, allowedServices);
    return logs;
}
async function countUsers() {
    const database = await getDb();
    return (await database.get("SELECT COUNT(*) as c FROM users"))?.c ?? 0;
}
async function countActiveAdmins() {
    const database = await getDb();
    return ((await database.get("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1"))?.c ?? 0);
}
async function countAdmins() {
    const database = await getDb();
    return ((await database.get("SELECT COUNT(*) as c FROM users WHERE role = 'admin'"))?.c ?? 0);
}
async function getUserByUsername(username) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const row = (await database.get("SELECT * FROM users WHERE username = ?", [
        username,
    ]));
    return row ? mapUser(row) : null;
}
async function getUserByEmail(email) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const row = (await database.get("SELECT * FROM users WHERE email = ?", [email]));
    return row ? mapUser(row) : null;
}
async function getUserById(id) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const row = (await database.get("SELECT * FROM users WHERE id = ?", [id]));
    return row ? mapUser(row) : null;
}
async function listUsers() {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const rows = (await database.all(`SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
            password_expires_at, allowed_services, created_at, last_login_at
     FROM users
     ORDER BY created_at ASC`));
    return rows.map((row) => mapUserSummary(row));
}
async function createUser(data) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const result = await database.run(`INSERT INTO users (
       username, email, password_hash, role, mfa_enabled, password_is_temporary, password_expires_at,
       allowed_services
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        data.username,
        data.email ?? null,
        data.password_hash,
        data.role,
        data.mfa_enabled ? 1 : 0,
        data.password_is_temporary ? 1 : 0,
        data.password_expires_at ?? null,
        serializeAllowedServices(data.allowed_services),
    ]);
    const created = (await database.get(`SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
            password_expires_at, allowed_services, created_at, last_login_at
     FROM users
     WHERE id = ?`, [result.lastID]));
    if (!created) {
        throw new Error("Failed to load created user");
    }
    return mapUserSummary(created);
}
async function updateUserRole(id, role) {
    const database = await getDb();
    const result = await database.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
    return (result.changes ?? 0) > 0;
}
async function updateUserPassword(id, passwordHash, options) {
    const database = await getDb();
    const result = await database.run(`UPDATE users
     SET password_hash = ?,
         password_is_temporary = ?,
         password_expires_at = ?
     WHERE id = ?`, [
        passwordHash,
        options?.password_is_temporary ? 1 : 0,
        options?.password_expires_at ?? null,
        id,
    ]);
    return (result.changes ?? 0) > 0;
}
async function updateUserEmail(id, email) {
    const database = await getDb();
    const result = await database.run("UPDATE users SET email = ? WHERE id = ?", [email, id]);
    return (result.changes ?? 0) > 0;
}
async function updateUserAllowedServices(id, allowedServices) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const result = await database.run("UPDATE users SET allowed_services = ? WHERE id = ?", [
        serializeAllowedServices(allowedServices),
        id,
    ]);
    return (result.changes ?? 0) > 0;
}
async function updateUserMfaEnabled(id, enabled) {
    const database = await getDb();
    const result = await database.run("UPDATE users SET mfa_enabled = ? WHERE id = ?", [
        enabled ? 1 : 0,
        id,
    ]);
    return (result.changes ?? 0) > 0;
}
async function setUserActive(id, isActive) {
    const database = await getDb();
    const result = await database.run("UPDATE users SET is_active = ? WHERE id = ?", [
        isActive ? 1 : 0,
        id,
    ]);
    return (result.changes ?? 0) > 0;
}
async function touchUserLogin(id) {
    const database = await getDb();
    await database.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [id]);
}
async function createAuthSession(data) {
    const database = await getDb();
    const result = await database.run(`INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`, [data.user_id, data.token_hash, data.expires_at]);
    const session = (await database.get("SELECT * FROM auth_sessions WHERE id = ?", [result.lastID]));
    if (!session) {
        throw new Error("Failed to load created session");
    }
    return session;
}
async function getUserBySessionTokenHash(tokenHash) {
    const database = await getDb();
    await ensureUsersAllowedServicesColumn(database);
    const row = (await database.get(`SELECT u.id, u.username, u.email, u.role, u.is_active, u.mfa_enabled,
              u.password_is_temporary, u.password_expires_at, u.allowed_services,
              u.created_at, u.last_login_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
           AND datetime(s.expires_at) > datetime('now')
           AND u.is_active = 1`, [tokenHash]));
    return row ? mapUserSummary(row) : null;
}
async function createAuthChallenge(data) {
    const database = await getDb();
    const result = await database.run(`INSERT INTO auth_challenges (user_id, purpose, token_hash, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`, [
        data.user_id,
        data.purpose,
        data.token_hash,
        data.code_hash ?? null,
        data.expires_at,
    ]);
    const challenge = (await database.get("SELECT * FROM auth_challenges WHERE id = ?", [result.lastID]));
    if (!challenge) {
        throw new Error("Failed to load created auth challenge");
    }
    return challenge;
}
async function getAuthChallengeByTokenHash(tokenHash, purpose) {
    const database = await getDb();
    const query = purpose
        ? `SELECT * FROM auth_challenges
       WHERE token_hash = ?
         AND purpose = ?
         AND datetime(expires_at) > datetime('now')`
        : `SELECT * FROM auth_challenges
       WHERE token_hash = ?
         AND datetime(expires_at) > datetime('now')`;
    return ((await database.get(query, purpose ? [tokenHash, purpose] : [tokenHash])) ?? null);
}
async function deleteAuthChallenge(tokenHash) {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_challenges WHERE token_hash = ?", [
        tokenHash,
    ]);
    return (result.changes ?? 0) > 0;
}
async function deleteAuthChallengesForUser(userId) {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_challenges WHERE user_id = ?", [userId]);
    return result.changes ?? 0;
}
async function cleanupExpiredAuthChallenges() {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_challenges WHERE datetime(expires_at) <= datetime('now')");
    return result.changes ?? 0;
}
async function deleteAuthSession(tokenHash) {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_sessions WHERE token_hash = ?", [
        tokenHash,
    ]);
    return (result.changes ?? 0) > 0;
}
async function deleteAuthSessionsForUser(userId) {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
    return result.changes ?? 0;
}
async function touchAuthSession(tokenHash, idleTimeoutMinutes) {
    const database = await getDb();
    await database.run(`UPDATE auth_sessions
     SET last_seen_at = datetime('now'),
         expires_at = datetime('now', '+' || ? || ' minutes')
     WHERE token_hash = ?`, [idleTimeoutMinutes, tokenHash]);
}
async function cleanupExpiredAuthSessions() {
    const database = await getDb();
    const result = await database.run("DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')");
    return result.changes ?? 0;
}
async function deleteUser(id) {
    const database = await getDb();
    const result = await database.run("DELETE FROM users WHERE id = ?", [id]);
    return (result.changes ?? 0) > 0;
}
async function createUserAuditLog(data) {
    if (data.action === "page_access" && !(await isAccessAuditEnabled())) {
        throw new Error("Access auditing is disabled");
    }
    const database = await getDb();
    const result = await database.run(`INSERT INTO user_audit_logs (
       actor_user_id, actor_username, subject_user_id, subject_username,
       action, resource, ip_address, user_agent, details
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        data.actor_user_id ?? null,
        data.actor_username ?? null,
        data.subject_user_id ?? null,
        data.subject_username ?? null,
        data.action,
        data.resource ?? null,
        data.ip_address ?? null,
        data.user_agent ?? null,
        data.details ?? null,
    ]);
    if (data.action === "page_access") {
        await deleteUserAccessAuditLogsOlderThan(await getAccessAuditRetentionDays());
    }
    const auditLog = (await database.get("SELECT * FROM user_audit_logs WHERE id = ?", [result.lastID]));
    if (!auditLog) {
        throw new Error("Failed to load created audit log");
    }
    return auditLog;
}
async function listUserAuditLogs(limit = 100) {
    const database = await getDb();
    return (await database.all(`SELECT *
     FROM user_audit_logs
     ORDER BY created_at DESC, id DESC
     LIMIT ?`, [limit]));
}
async function listUserAccessAuditLogs(limit = 100) {
    const database = await getDb();
    return (await database.all(`SELECT *
     FROM user_audit_logs
     WHERE action = 'page_access'
     ORDER BY created_at DESC, id DESC
     LIMIT ?`, [limit]));
}
async function deleteUserAccessAuditLogsOlderThan(days) {
    const safeDays = Math.floor(days);
    if (!Number.isFinite(safeDays) || safeDays < 1) {
        throw new Error(`Invalid days value: ${days}`);
    }
    const database = await getDb();
    const result = await database.run(`DELETE FROM user_audit_logs
     WHERE action = 'page_access'
     AND created_at < datetime('now', '-' || ? || ' days')`, [safeDays]);
    return result.changes ?? 0;
}
async function deleteAllUserAccessAuditLogs() {
    const database = await getDb();
    const result = await database.run("DELETE FROM user_audit_logs WHERE action = 'page_access'");
    return result.changes ?? 0;
}
