import {
  getDb,
  parseAllowedServices,
  serializeAllowedServices,
  withTransaction,
  type AuthChallenge,
  type AuthSession,
  type SqliteDatabase,
  type User,
  type UserAuditLog,
  type UserRole,
  type UserSummary,
} from "./core";
import { getAccessAuditRetentionDays, isAccessAuditEnabled } from "./settings";

interface UserRow extends Omit<User, "allowed_services"> {
  allowed_services: string | null;
}

interface UserSummaryRow extends Omit<UserSummary, "allowed_services"> {
  allowed_services: string | null;
}

function mapUser(row: UserRow): User {
  return {
    ...row,
    allowed_services: parseAllowedServices(
      row.allowed_services,
      `user ${row.id}`
    ),
  };
}

function mapUserSummary(row: UserSummaryRow): UserSummary {
  return {
    ...row,
    allowed_services: parseAllowedServices(
      row.allowed_services,
      `user ${row.id}`
    ),
  };
}

async function ensureUsersAllowedServicesColumn(
  database: SqliteDatabase
): Promise<void> {
  const columns = (await database.all<{ name: string }[]>(
    "PRAGMA table_info(users)"
  )) as { name: string }[];

  if (!columns.some((column) => column.name === "allowed_services")) {
    await database.exec("ALTER TABLE users ADD COLUMN allowed_services TEXT");
  }
}

export async function countUsers(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>("SELECT COUNT(*) as c FROM users")) as
        { c: number } | undefined
    )?.c ?? 0
  );
}

export async function countActiveAdmins(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1"
      )) as { c: number } | undefined
    )?.c ?? 0
  );
}

export async function countAdmins(): Promise<number> {
  const database = await getDb();
  return (
    (
      (await database.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin'"
      )) as { c: number } | undefined
    )?.c ?? 0
  );
}

export async function getUserByUsername(
  username: string
): Promise<User | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserRow>(
    "SELECT * FROM users WHERE username = ?",
    [username]
  )) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const row = (await database.get<UserRow>(
    "SELECT * FROM users WHERE email = ?",
    [email]
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
     ORDER BY created_at ASC`
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
    ]
  );

  const created = (await database.get<UserSummaryRow>(
    `SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
            password_expires_at, allowed_services, created_at, last_login_at
     FROM users
     WHERE id = ?`,
    [result.lastID]
  )) as UserSummaryRow | undefined;

  if (!created) {
    throw new Error("Failed to load created user");
  }

  return mapUserSummary(created);
}

export async function createInitialAdminUser(data: {
  username: string;
  email: string;
  password_hash: string;
}): Promise<UserSummary> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);

  return withTransaction(database, async () => {
    const existingUsers =
      (
        (await database.get<{ c: number }>(
          "SELECT COUNT(*) as c FROM users"
        )) as { c: number } | undefined
      )?.c ?? 0;

    if (existingUsers > 0) {
      throw new Error("Initial setup has already been completed");
    }

    const result = await database.run(
      `INSERT INTO users (
         username, email, password_hash, role, mfa_enabled, password_is_temporary, password_expires_at,
         allowed_services
       ) VALUES (?, ?, ?, 'admin', 0, 0, NULL, NULL)`,
      [data.username, data.email, data.password_hash]
    );

    const created = (await database.get<UserSummaryRow>(
      `SELECT id, username, email, role, is_active, mfa_enabled, password_is_temporary,
              password_expires_at, allowed_services, created_at, last_login_at
       FROM users
       WHERE id = ?`,
      [result.lastID]
    )) as UserSummaryRow | undefined;

    if (!created) {
      throw new Error("Failed to load created user");
    }

    return mapUserSummary(created);
  });
}

export async function updateUserRole(
  id: number,
  role: UserRole
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
  }
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
    ]
  );

  return (result.changes ?? 0) > 0;
}

export async function updateUserEmail(
  id: number,
  email: string | null
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
  allowedServices: string[] | null
): Promise<boolean> {
  const database = await getDb();
  await ensureUsersAllowedServicesColumn(database);
  const result = await database.run(
    "UPDATE users SET allowed_services = ? WHERE id = ?",
    [serializeAllowedServices(allowedServices), id]
  );
  return (result.changes ?? 0) > 0;
}

export async function updateUserMfaEnabled(
  id: number,
  enabled: boolean
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE users SET mfa_enabled = ? WHERE id = ?",
    [enabled ? 1 : 0, id]
  );

  return (result.changes ?? 0) > 0;
}

export async function setUserActive(
  id: number,
  isActive: boolean
): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE users SET is_active = ? WHERE id = ?",
    [isActive ? 1 : 0, id]
  );

  return (result.changes ?? 0) > 0;
}

export async function touchUserLogin(id: number): Promise<void> {
  const database = await getDb();
  await database.run(
    "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
    [id]
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
    [data.user_id, data.token_hash, data.expires_at]
  );

  const session = (await database.get<AuthSession>(
    "SELECT * FROM auth_sessions WHERE id = ?",
    [result.lastID]
  )) as AuthSession | undefined;

  if (!session) {
    throw new Error("Failed to load created session");
  }

  return session;
}

export async function getUserBySessionTokenHash(
  tokenHash: string
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
    [tokenHash]
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
    ]
  );

  const challenge = (await database.get<AuthChallenge>(
    "SELECT * FROM auth_challenges WHERE id = ?",
    [result.lastID]
  )) as AuthChallenge | undefined;

  if (!challenge) {
    throw new Error("Failed to load created auth challenge");
  }

  return challenge;
}

export async function getAuthChallengeByTokenHash(
  tokenHash: string,
  purpose?: string
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
      purpose ? [tokenHash, purpose] : [tokenHash]
    )) as AuthChallenge | undefined) ?? null
  );
}

export async function deleteAuthChallenge(tokenHash: string): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE token_hash = ?",
    [tokenHash]
  );

  return (result.changes ?? 0) > 0;
}

export async function deleteAuthChallengesForUser(
  userId: number
): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE user_id = ?",
    [userId]
  );
  return result.changes ?? 0;
}

export async function cleanupExpiredAuthChallenges(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_challenges WHERE datetime(expires_at) <= datetime('now')"
  );

  return result.changes ?? 0;
}

export async function deleteAuthSession(tokenHash: string): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE token_hash = ?",
    [tokenHash]
  );

  return (result.changes ?? 0) > 0;
}

export async function deleteAuthSessionsForUser(
  userId: number
): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE user_id = ?",
    [userId]
  );
  return result.changes ?? 0;
}

export async function touchAuthSession(
  tokenHash: string,
  idleTimeoutMinutes: number
): Promise<void> {
  const database = await getDb();
  await database.run(
    `UPDATE auth_sessions
     SET last_seen_at = datetime('now'),
         expires_at = datetime('now', '+' || ? || ' minutes')
     WHERE token_hash = ?`,
    [idleTimeoutMinutes, tokenHash]
  );
}

export async function cleanupExpiredAuthSessions(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')"
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
    ]
  );

  if (data.action === "page_access") {
    await deleteUserAccessAuditLogsOlderThan(
      await getAccessAuditRetentionDays()
    );
  }

  const auditLog = (await database.get<UserAuditLog>(
    "SELECT * FROM user_audit_logs WHERE id = ?",
    [result.lastID]
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
    [limit]
  )) as UserAuditLog[];
}

export async function listUserAccessAuditLogs(
  limit = 100
): Promise<UserAuditLog[]> {
  const database = await getDb();
  return (await database.all<UserAuditLog[]>(
    `SELECT *
     FROM user_audit_logs
     WHERE action = 'page_access'
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit]
  )) as UserAuditLog[];
}

export async function deleteUserAccessAuditLogsOlderThan(
  days: number
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
    [safeDays]
  );

  return result.changes ?? 0;
}

export async function deleteAllUserAccessAuditLogs(): Promise<number> {
  const database = await getDb();
  const result = await database.run(
    "DELETE FROM user_audit_logs WHERE action = 'page_access'"
  );

  return result.changes ?? 0;
}
