"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const compiledDbModulePath = node_path_1.default.resolve(__dirname, "../lib/db.js");
async function loadDbModule() {
    const tempDir = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "zinalog-db-test-"));
    const databasePath = node_path_1.default.join(tempDir, "logs.db");
    const runtimeModulesDir = node_path_1.default.resolve(__dirname, "../.module-cache");
    await promises_1.default.mkdir(runtimeModulesDir, { recursive: true });
    const runtimeModulePath = node_path_1.default.join(runtimeModulesDir, `db-runtime-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`);
    await promises_1.default.copyFile(compiledDbModulePath, runtimeModulePath);
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDatabasePath = process.env.DATABASE_PATH;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_PATH = databasePath;
    const dbModule = (await Promise.resolve(`${runtimeModulePath}`).then(s => __importStar(require(s))));
    return {
        tempDir,
        runtimeModulePath,
        dbModule,
        previousNodeEnv,
        previousDatabasePath,
    };
}
async function closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath) {
    const db = await dbModule.getDb();
    await db.close();
    if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
    }
    else {
        process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
    }
    else {
        process.env.DATABASE_PATH = previousDatabasePath;
    }
    await promises_1.default.rm(runtimeModulePath, { force: true });
    await promises_1.default.rm(tempDir, { recursive: true, force: true });
}
(0, node_test_1.default)("initializes the async SQLite database with default settings", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    strict_1.default.equal(await dbModule.getSetting("retention_days"), "30");
    strict_1.default.equal(await dbModule.getSetting("max_logs"), "100000");
    strict_1.default.equal(await dbModule.getSetting("session_idle_timeout_minutes"), "30");
    const settings = await dbModule.getAllSettings();
    strict_1.default.equal(settings.alert_levels, "error");
    strict_1.default.equal(settings.session_idle_timeout_minutes, "30");
    strict_1.default.equal(settings.webhook_method, "POST");
});
(0, node_test_1.default)("writes, filters, and trims logs asynchronously", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    await dbModule.setSetting("max_logs", "2");
    await dbModule.insertLog({
        level: "info",
        message: "first message",
        service: "api",
    });
    await dbModule.insertLog({
        level: "error",
        message: "second message",
        service: "worker",
        metadata: JSON.stringify({ requestId: "abc123" }),
    });
    await dbModule.insertLog({
        level: "warning",
        message: "third message",
        service: "api",
    });
    const allLogs = await dbModule.exportLogs();
    strict_1.default.equal(allLogs.length, 2);
    strict_1.default.equal(allLogs.some((log) => log.message === "first message"), false);
    strict_1.default.equal(allLogs.some((log) => log.message === "second message"), true);
    strict_1.default.equal(allLogs.some((log) => log.message === "third message"), true);
    const filtered = await dbModule.queryLogs({
        service: "worker",
        search: "abc123",
        page: 1,
        limit: 10,
    });
    strict_1.default.equal(filtered.total, 1);
    strict_1.default.equal(filtered.logs[0]?.message, "second message");
    const restricted = await dbModule.queryLogs({
        page: 1,
        limit: 10,
    }, ["worker"]);
    strict_1.default.equal(restricted.total, 1);
    strict_1.default.equal(restricted.logs[0]?.service, "worker");
    const services = await dbModule.getServices();
    strict_1.default.deepEqual(services, ["api", "worker"]);
    const restrictedServices = await dbModule.getServices(["worker"]);
    strict_1.default.deepEqual(restrictedServices, ["worker"]);
    const stats = await dbModule.getStats();
    strict_1.default.equal(stats.total, 2);
    strict_1.default.equal(stats.errorsToday, 1);
    const restrictedStats = await dbModule.getStats(["worker"]);
    strict_1.default.equal(restrictedStats.total, 1);
    strict_1.default.equal(restrictedStats.services, 1);
    strict_1.default.deepEqual(restrictedStats.byService, [{ service: "worker", count: 1 }]);
});
(0, node_test_1.default)("creates, touches, revokes, and deletes API keys asynchronously", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    const rawKey = "zinalog_test_key_123";
    const created = await dbModule.createApiKey({
        name: "CI key",
        rawKey,
        service: "api",
        allowed_ips: "127.0.0.1",
        rate_limit: 50,
    });
    const resolved = await dbModule.getApiKey(rawKey);
    strict_1.default.ok(resolved);
    strict_1.default.equal(resolved?.id, created.id);
    strict_1.default.equal(resolved?.service, "api");
    strict_1.default.notEqual(resolved?.key_hash, rawKey);
    await dbModule.touchApiKey(created.id);
    const touched = (await dbModule.listApiKeys()).find((key) => key.id === created.id);
    strict_1.default.equal(touched?.usage_count, 1);
    strict_1.default.ok(touched?.last_used_at);
    strict_1.default.equal(await dbModule.revokeApiKey(created.id), true);
    strict_1.default.equal(await dbModule.getApiKey(rawKey), null);
    strict_1.default.equal(await dbModule.deleteApiKey(created.id), true);
    strict_1.default.equal((await dbModule.listApiKeys()).length, 0);
});
(0, node_test_1.default)("supports async user, session, challenge, and audit operations", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    const user = await dbModule.createUser({
        username: "alice",
        email: "alice@example.com",
        password_hash: "hashed-password",
        role: "admin",
        allowed_services: ["api", "worker"],
    });
    strict_1.default.equal(await dbModule.countUsers(), 1);
    strict_1.default.equal(await dbModule.countAdmins(), 1);
    strict_1.default.equal(await dbModule.countActiveAdmins(), 1);
    const loadedUser = await dbModule.getUserByUsername("alice");
    strict_1.default.equal(loadedUser?.email, "alice@example.com");
    strict_1.default.deepEqual(loadedUser?.allowed_services, ["api", "worker"]);
    const session = await dbModule.createAuthSession({
        user_id: user.id,
        token_hash: "session-hash",
        expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    strict_1.default.equal(session.user_id, user.id);
    const sessionUser = await dbModule.getUserBySessionTokenHash("session-hash");
    strict_1.default.equal(sessionUser?.username, "alice");
    strict_1.default.deepEqual(sessionUser?.allowed_services, ["api", "worker"]);
    await dbModule.touchAuthSession("session-hash", 45);
    const refreshedSession = await (await dbModule.getDb()).get(`SELECT CAST(strftime('%s', expires_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER) as ttlSeconds,
            last_seen_at as lastSeenAt
     FROM auth_sessions
     WHERE token_hash = ?`, ["session-hash"]);
    strict_1.default.ok(refreshedSession);
    strict_1.default.ok(refreshedSession.ttlSeconds >= 44 * 60);
    strict_1.default.ok(refreshedSession.ttlSeconds <= 45 * 60);
    strict_1.default.ok(refreshedSession.lastSeenAt);
    await dbModule.touchUserLogin(user.id);
    const updatedUser = await dbModule.getUserById(user.id);
    strict_1.default.ok(updatedUser?.last_login_at);
    const challenge = await dbModule.createAuthChallenge({
        user_id: user.id,
        purpose: "mfa",
        token_hash: "challenge-hash",
        code_hash: "code-hash",
        expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    strict_1.default.equal(challenge.user_id, user.id);
    strict_1.default.equal((await dbModule.getAuthChallengeByTokenHash("challenge-hash", "mfa"))?.token_hash, "challenge-hash");
    const firstCooldown = await dbModule.checkAndSetCooldown("api", "error", 15);
    const secondCooldown = await dbModule.checkAndSetCooldown("api", "error", 15);
    strict_1.default.equal(firstCooldown, true);
    strict_1.default.equal(secondCooldown, false);
    const auditLog = await dbModule.createUserAuditLog({
        actor_user_id: user.id,
        actor_username: user.username,
        subject_user_id: user.id,
        subject_username: user.username,
        action: "user_created",
        resource: "tests",
    });
    strict_1.default.equal(auditLog.action, "user_created");
    strict_1.default.equal((await dbModule.listUserAuditLogs()).length, 1);
    strict_1.default.equal(await dbModule.deleteAuthChallenge("challenge-hash"), true);
    strict_1.default.equal(await dbModule.deleteAuthSession("session-hash"), true);
    strict_1.default.equal(await dbModule.deleteUser(user.id), true);
    strict_1.default.equal(await dbModule.countUsers(), 0);
});
(0, node_test_1.default)("groups logs, counts recent activity, and deletes retained logs", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    const oldestId = await dbModule.insertLog({
        level: "error",
        message: "Payment gateway timeout",
        service: "billing-api",
    });
    await dbModule.insertLog({
        level: "error",
        message: "Payment gateway timeout",
        service: "billing-api",
    });
    await dbModule.insertLog({
        level: "error",
        message: "Payment gateway timeout",
        service: "checkout-api",
    });
    await dbModule.insertLog({
        level: "warning",
        message: "Retrying failed job",
        service: "billing-api",
    });
    const db = await dbModule.getDb();
    await db.run("UPDATE logs SET created_at = datetime('now', '-10 days') WHERE id = ?", [oldestId]);
    const recentBillingErrors = await dbModule.countRecentLogs("error", "billing-api", 60);
    strict_1.default.equal(recentBillingErrors, 1);
    const recentGlobalErrors = await dbModule.countRecentLogs("error", null, 60);
    strict_1.default.equal(recentGlobalErrors, 2);
    const warningGroups = await dbModule.getLogGroups("warning");
    strict_1.default.deepEqual(warningGroups.map((group) => ({
        message: group.message,
        service: group.service,
        count: group.count,
    })), [{ message: "Retrying failed job", service: "billing-api", count: 1 }]);
    const errorGroups = await dbModule.getErrorGroups();
    strict_1.default.deepEqual(errorGroups.map((group) => ({
        message: group.message,
        service: group.service,
        count: group.count,
    })), [
        { message: "Payment gateway timeout", service: "billing-api", count: 2 },
        { message: "Payment gateway timeout", service: "checkout-api", count: 1 },
    ]);
    strict_1.default.equal(await dbModule.deleteOldLogs(7), 1);
    const remainingLogs = await dbModule.exportLogs();
    strict_1.default.equal(remainingLogs.length, 3);
    strict_1.default.equal(remainingLogs.some((log) => log.id === oldestId), false);
});
(0, node_test_1.default)("applies settings fallbacks and cleans up auth records", async (t) => {
    const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } = await loadDbModule();
    t.after(async () => closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath));
    await dbModule.setSettings({
        access_audit_enabled: "0",
        access_audit_retention_days: "not-a-number",
        session_idle_timeout_minutes: "not-a-number",
    });
    strict_1.default.equal(await dbModule.isAccessAuditEnabled(), false);
    strict_1.default.equal(await dbModule.getAccessAuditRetentionDays(), 30);
    strict_1.default.equal(await dbModule.getSessionIdleTimeoutMinutes(), 30);
    await strict_1.default.rejects(dbModule.createUserAuditLog({
        actor_username: "alice",
        action: "page_access",
        resource: "/dashboard",
    }), /Access auditing is disabled/);
    await dbModule.setSettings({
        access_audit_enabled: "1",
        access_audit_retention_days: "7",
    });
    const user = await dbModule.createUser({
        username: "bob",
        email: "bob@example.com",
        password_hash: "hashed-password",
        role: "operator",
        mfa_enabled: true,
        password_is_temporary: true,
        password_expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    const activeSession = await dbModule.createAuthSession({
        user_id: user.id,
        token_hash: "active-session-hash",
        expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    await dbModule.createAuthSession({
        user_id: user.id,
        token_hash: "expired-session-hash",
        expires_at: new Date(Date.now() - 60000).toISOString(),
    });
    const activeChallenge = await dbModule.createAuthChallenge({
        user_id: user.id,
        purpose: "mfa",
        token_hash: "active-challenge-hash",
        code_hash: "active-code-hash",
        expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    await dbModule.createAuthChallenge({
        user_id: user.id,
        purpose: "mfa",
        token_hash: "expired-challenge-hash",
        code_hash: "expired-code-hash",
        expires_at: new Date(Date.now() - 60000).toISOString(),
    });
    strict_1.default.equal((await dbModule.getUserBySessionTokenHash(activeSession.token_hash))?.id, user.id);
    strict_1.default.equal(await dbModule.getUserBySessionTokenHash("expired-session-hash"), null);
    strict_1.default.equal((await dbModule.getAuthChallengeByTokenHash(activeChallenge.token_hash, "mfa"))?.id, activeChallenge.id);
    strict_1.default.equal(await dbModule.getAuthChallengeByTokenHash("expired-challenge-hash", "mfa"), null);
    strict_1.default.equal(await dbModule.cleanupExpiredAuthSessions(), 1);
    strict_1.default.equal(await dbModule.cleanupExpiredAuthChallenges(), 1);
    const db = await dbModule.getDb();
    const authRowsBeforeDelete = (await db.get(`SELECT
       (SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?) as sessionCount,
       (SELECT COUNT(*) FROM auth_challenges WHERE user_id = ?) as challengeCount`, [user.id, user.id]));
    strict_1.default.deepEqual(authRowsBeforeDelete, { sessionCount: 1, challengeCount: 1 });
    strict_1.default.equal(await dbModule.deleteUser(user.id), true);
    const authRowsAfterDelete = (await db.get(`SELECT
       (SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?) as sessionCount,
       (SELECT COUNT(*) FROM auth_challenges WHERE user_id = ?) as challengeCount`, [user.id, user.id]));
    strict_1.default.deepEqual(authRowsAfterDelete, { sessionCount: 0, challengeCount: 0 });
    strict_1.default.equal(await dbModule.countUsers(), 0);
});
