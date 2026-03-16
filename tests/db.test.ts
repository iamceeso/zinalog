import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type DbModule = typeof import("../lib/db");

const compiledDbModulePath = path.resolve(__dirname, "../lib/db.js");

async function loadDbModule() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zinalog-db-test-"));
  const databasePath = path.join(tempDir, "logs.db");
  const runtimeModulesDir = path.resolve(__dirname, "../.module-cache");
  await fs.mkdir(runtimeModulesDir, { recursive: true });
  const runtimeModulePath = path.join(
    runtimeModulesDir,
    `db-runtime-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`
  );
  await fs.copyFile(compiledDbModulePath, runtimeModulePath);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabasePath = process.env.DATABASE_PATH;
  process.env.NODE_ENV = "production";
  process.env.DATABASE_PATH = databasePath;
  const dbModule = (await import(runtimeModulePath)) as DbModule;

  return {
    tempDir,
    runtimeModulePath,
    dbModule,
    previousNodeEnv,
    previousDatabasePath,
  };
}

async function closeAndCleanup(
  tempDir: string,
  runtimeModulePath: string,
  dbModule: DbModule,
  previousNodeEnv: string | undefined,
  previousDatabasePath: string | undefined
) {
  const db = await dbModule.getDb();
  await db.close();
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
  if (previousDatabasePath === undefined) {
    delete process.env.DATABASE_PATH;
  } else {
    process.env.DATABASE_PATH = previousDatabasePath;
  }
  await fs.rm(runtimeModulePath, { force: true });
  await fs.rm(tempDir, { recursive: true, force: true });
}

test("initializes the async SQLite database with default settings", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

  assert.equal(await dbModule.getSetting("retention_days"), "30");
  assert.equal(await dbModule.getSetting("max_logs"), "100000");
  assert.equal(await dbModule.getSetting("session_idle_timeout_minutes"), "30");

  const settings = await dbModule.getAllSettings();
  assert.equal(settings.alert_levels, "error");
  assert.equal(settings.session_idle_timeout_minutes, "30");
  assert.equal(settings.webhook_method, "POST");
});

test("writes, filters, and trims logs asynchronously", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

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
  assert.equal(allLogs.length, 2);
  assert.equal(allLogs.some((log) => log.message === "first message"), false);
  assert.equal(allLogs.some((log) => log.message === "second message"), true);
  assert.equal(allLogs.some((log) => log.message === "third message"), true);

  const filtered = await dbModule.queryLogs({
    service: "worker",
    search: "abc123",
    page: 1,
    limit: 10,
  });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.logs[0]?.message, "second message");

  const restricted = await dbModule.queryLogs(
    {
      page: 1,
      limit: 10,
    },
    ["worker"]
  );
  assert.equal(restricted.total, 1);
  assert.equal(restricted.logs[0]?.service, "worker");

  const services = await dbModule.getServices();
  assert.deepEqual(services, ["api", "worker"]);

  const restrictedServices = await dbModule.getServices(["worker"]);
  assert.deepEqual(restrictedServices, ["worker"]);

  const stats = await dbModule.getStats();
  assert.equal(stats.total, 2);
  assert.equal(stats.errorsToday, 1);

  const restrictedStats = await dbModule.getStats(["worker"]);
  assert.equal(restrictedStats.total, 1);
  assert.equal(restrictedStats.services, 1);
  assert.deepEqual(restrictedStats.byService, [{ service: "worker", count: 1 }]);
});

test("creates, touches, revokes, and deletes API keys asynchronously", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

  const rawKey = "zinalog_test_key_123";
  const created = await dbModule.createApiKey({
    name: "CI key",
    rawKey,
    service: "api",
    allowed_ips: "127.0.0.1",
    rate_limit: 50,
  });

  const resolved = await dbModule.getApiKey(rawKey);
  assert.ok(resolved);
  assert.equal(resolved?.id, created.id);
  assert.equal(resolved?.service, "api");
  assert.notEqual(resolved?.key_hash, rawKey);

  await dbModule.touchApiKey(created.id);
  const touched = (await dbModule.listApiKeys()).find((key) => key.id === created.id);
  assert.equal(touched?.usage_count, 1);
  assert.ok(touched?.last_used_at);

  assert.equal(await dbModule.revokeApiKey(created.id), true);
  assert.equal(await dbModule.getApiKey(rawKey), null);
  assert.equal(await dbModule.deleteApiKey(created.id), true);
  assert.equal((await dbModule.listApiKeys()).length, 0);
});

test("supports async user, session, challenge, and audit operations", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

  const user = await dbModule.createUser({
    username: "alice",
    email: "alice@example.com",
    password_hash: "hashed-password",
    role: "admin",
    allowed_services: ["api", "worker"],
  });

  assert.equal(await dbModule.countUsers(), 1);
  assert.equal(await dbModule.countAdmins(), 1);
  assert.equal(await dbModule.countActiveAdmins(), 1);

  const loadedUser = await dbModule.getUserByUsername("alice");
  assert.equal(loadedUser?.email, "alice@example.com");
  assert.deepEqual(loadedUser?.allowed_services, ["api", "worker"]);

  const session = await dbModule.createAuthSession({
    user_id: user.id,
    token_hash: "session-hash",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(session.user_id, user.id);

  const sessionUser = await dbModule.getUserBySessionTokenHash("session-hash");
  assert.equal(sessionUser?.username, "alice");
  assert.deepEqual(sessionUser?.allowed_services, ["api", "worker"]);

  await dbModule.touchAuthSession("session-hash", 45);
  const refreshedSession = await (await dbModule.getDb()).get<{
    ttlSeconds: number;
    lastSeenAt: string;
  }>(
    `SELECT CAST(strftime('%s', expires_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER) as ttlSeconds,
            last_seen_at as lastSeenAt
     FROM auth_sessions
     WHERE token_hash = ?`,
    ["session-hash"]
  );
  assert.ok(refreshedSession);
  assert.ok(refreshedSession.ttlSeconds >= 44 * 60);
  assert.ok(refreshedSession.ttlSeconds <= 45 * 60);
  assert.ok(refreshedSession.lastSeenAt);

  await dbModule.touchUserLogin(user.id);
  const updatedUser = await dbModule.getUserById(user.id);
  assert.ok(updatedUser?.last_login_at);

  const challenge = await dbModule.createAuthChallenge({
    user_id: user.id,
    purpose: "mfa",
    token_hash: "challenge-hash",
    code_hash: "code-hash",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(challenge.user_id, user.id);
  assert.equal(
    (await dbModule.getAuthChallengeByTokenHash("challenge-hash", "mfa"))?.token_hash,
    "challenge-hash"
  );

  const firstCooldown = await dbModule.checkAndSetCooldown("api", "error", 15);
  const secondCooldown = await dbModule.checkAndSetCooldown("api", "error", 15);
  assert.equal(firstCooldown, true);
  assert.equal(secondCooldown, false);

  const auditLog = await dbModule.createUserAuditLog({
    actor_user_id: user.id,
    actor_username: user.username,
    subject_user_id: user.id,
    subject_username: user.username,
    action: "user_created",
    resource: "tests",
  });
  assert.equal(auditLog.action, "user_created");
  assert.equal((await dbModule.listUserAuditLogs()).length, 1);

  assert.equal(await dbModule.deleteAuthChallenge("challenge-hash"), true);
  assert.equal(await dbModule.deleteAuthSession("session-hash"), true);
  assert.equal(await dbModule.deleteUser(user.id), true);
  assert.equal(await dbModule.countUsers(), 0);
});

test("groups logs, counts recent activity, and deletes retained logs", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

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
  assert.equal(recentBillingErrors, 1);

  const recentGlobalErrors = await dbModule.countRecentLogs("error", null, 60);
  assert.equal(recentGlobalErrors, 2);

  const warningGroups = await dbModule.getLogGroups("warning");
  assert.deepEqual(
    warningGroups.map((group) => ({
      message: group.message,
      service: group.service,
      count: group.count,
    })),
    [{ message: "Retrying failed job", service: "billing-api", count: 1 }]
  );

  const errorGroups = await dbModule.getErrorGroups();
  assert.deepEqual(
    errorGroups.map((group) => ({
      message: group.message,
      service: group.service,
      count: group.count,
    })),
    [
      { message: "Payment gateway timeout", service: "billing-api", count: 2 },
      { message: "Payment gateway timeout", service: "checkout-api", count: 1 },
    ]
  );

  assert.equal(await dbModule.deleteOldLogs(7), 1);

  const remainingLogs = await dbModule.exportLogs();
  assert.equal(remainingLogs.length, 3);
  assert.equal(remainingLogs.some((log) => log.id === oldestId), false);
});

test("applies settings fallbacks and cleans up auth records", async (t) => {
  const { tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath } =
    await loadDbModule();
  t.after(async () =>
    closeAndCleanup(tempDir, runtimeModulePath, dbModule, previousNodeEnv, previousDatabasePath)
  );

  await dbModule.setSettings({
    access_audit_enabled: "0",
    access_audit_retention_days: "not-a-number",
    session_idle_timeout_minutes: "not-a-number",
  });

  assert.equal(await dbModule.isAccessAuditEnabled(), false);
  assert.equal(await dbModule.getAccessAuditRetentionDays(), 30);
  assert.equal(await dbModule.getSessionIdleTimeoutMinutes(), 30);

  await assert.rejects(
    dbModule.createUserAuditLog({
      actor_username: "alice",
      action: "page_access",
      resource: "/dashboard",
    }),
    /Access auditing is disabled/
  );

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
    password_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });

  const activeSession = await dbModule.createAuthSession({
    user_id: user.id,
    token_hash: "active-session-hash",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  await dbModule.createAuthSession({
    user_id: user.id,
    token_hash: "expired-session-hash",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });

  const activeChallenge = await dbModule.createAuthChallenge({
    user_id: user.id,
    purpose: "mfa",
    token_hash: "active-challenge-hash",
    code_hash: "active-code-hash",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  await dbModule.createAuthChallenge({
    user_id: user.id,
    purpose: "mfa",
    token_hash: "expired-challenge-hash",
    code_hash: "expired-code-hash",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });

  assert.equal((await dbModule.getUserBySessionTokenHash(activeSession.token_hash))?.id, user.id);
  assert.equal(await dbModule.getUserBySessionTokenHash("expired-session-hash"), null);
  assert.equal(
    (await dbModule.getAuthChallengeByTokenHash(activeChallenge.token_hash, "mfa"))?.id,
    activeChallenge.id
  );
  assert.equal(await dbModule.getAuthChallengeByTokenHash("expired-challenge-hash", "mfa"), null);

  assert.equal(await dbModule.cleanupExpiredAuthSessions(), 1);
  assert.equal(await dbModule.cleanupExpiredAuthChallenges(), 1);

  const db = await dbModule.getDb();
  const authRowsBeforeDelete = (await db.get<{
    sessionCount: number;
    challengeCount: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?) as sessionCount,
       (SELECT COUNT(*) FROM auth_challenges WHERE user_id = ?) as challengeCount`,
    [user.id, user.id]
  ))!;
  assert.deepEqual(authRowsBeforeDelete, { sessionCount: 1, challengeCount: 1 });

  assert.equal(await dbModule.deleteUser(user.id), true);

  const authRowsAfterDelete = (await db.get<{
    sessionCount: number;
    challengeCount: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?) as sessionCount,
       (SELECT COUNT(*) FROM auth_challenges WHERE user_id = ?) as challengeCount`,
    [user.id, user.id]
  ))!;
  assert.deepEqual(authRowsAfterDelete, { sessionCount: 0, challengeCount: 0 });
  assert.equal(await dbModule.countUsers(), 0);
});
