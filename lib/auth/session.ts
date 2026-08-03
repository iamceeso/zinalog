import { randomBytes, createHash, scryptSync, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "../auth";
import {
  cleanupExpiredAuthChallenges,
  cleanupExpiredAuthSessions,
  countUsers,
  createAuthChallenge,
  createAuthSession,
  createInitialAdminUser,
  createUserAuditLog,
  getAccessAuditRetentionDays,
  getSessionIdleTimeoutMinutes,
  deleteAuthChallenge,
  deleteUserAccessAuditLogsOlderThan,
  deleteAuthChallengesForUser,
  deleteAuthSession,
  getAuthChallengeByTokenHash,
  isAccessAuditEnabled,
  getUserById,
  getUserBySessionTokenHash,
  getUserByUsername,
  touchAuthSession,
  touchUserLogin,
  updateUserPassword,
  type User,
  type UserRole,
  type UserSummary,
} from "../db";
import { buildMfaEmail, sendEmail } from "../email";
import {
  clearLoginAttempts,
  clearMfaAttempts,
  consumeLoginAttempt,
  consumeMfaAttempt,
} from "../auth-abuse";

const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_HASH_BYTES = 64;
const PASSWORD_SALT_BYTES = 16;
const SESSION_COOKIE_NAME = "zinalog_session";
const PREAUTH_COOKIE_NAME = "zinalog_preauth";
const SESSION_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TEMP_PASSWORD_TTL_MS = 10 * 60 * 1000;
const MFA_TTL_MS = 10 * 60 * 1000;

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

export type SessionUser = UserSummary;

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHash] = storedHash.split("$");
  if (
    algorithm !== PASSWORD_HASH_PREFIX ||
    !salt ||
    !expectedHash ||
    expectedHash.length !== PASSWORD_HASH_BYTES * 2 ||
    /[^0-9a-f]/i.test(expectedHash)
  ) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  const actual = scryptSync(password, salt, PASSWORD_HASH_BYTES);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildCookieExpiry(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs);
}

function getSessionCookieOptions(expires: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

function getPreAuthCookieOptions(expires: Date) {
  return {
    name: PREAUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

function hasRole(role: UserRole, minimumRole: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

async function getSessionTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

async function getPreAuthTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(PREAUTH_COOKIE_NAME)?.value ?? null;
}

async function getCurrentUserFromSession(): Promise<SessionUser | null> {
  await cleanupExpiredAuthSessions();

  const sessionToken = await getSessionTokenFromCookies();
  if (!sessionToken) return null;

  const tokenHash = hashToken(sessionToken);
  const user = await getUserBySessionTokenHash(tokenHash);
  if (!user) return null;

  await touchAuthSession(tokenHash, await getSessionIdleTimeoutMinutes());
  return user;
}

export function ensureStrongPassword(password: string): void {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters");
  }

  const checks = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  if (!checks.every((pattern) => pattern.test(password))) {
    throw new Error(
      "Password must include uppercase, lowercase, number, and special character"
    );
  }
}

export function ensureValidUsername(username: string): void {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error(
      "Username must be 3-32 characters and only include letters, numbers, dot, underscore, or dash"
    );
  }
}

export function ensureValidEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email address is required");
  }
  return normalized;
}

function generateMfaCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

async function setSessionCookie(
  response: NextResponse,
  userId: number
): Promise<void> {
  const idleTimeoutMinutes = await getSessionIdleTimeoutMinutes();
  const sessionToken = randomBytes(32).toString("hex");
  const sessionExpires = buildCookieExpiry(idleTimeoutMinutes * 60 * 1000);
  const cookieExpires = buildCookieExpiry(SESSION_COOKIE_TTL_MS);
  await createAuthSession({
    user_id: userId,
    token_hash: hashToken(sessionToken),
    expires_at: sessionExpires.toISOString(),
  });

  response.cookies.set({
    ...getSessionCookieOptions(cookieExpires),
    value: sessionToken,
  });
}

function clearPreAuthCookie(response: NextResponse): void {
  response.cookies.set({
    ...getPreAuthCookieOptions(new Date(0)),
    value: "",
    maxAge: 0,
  });
}

function setPreAuthCookie(
  response: NextResponse,
  token: string,
  expiresAt: string
): void {
  response.cookies.set({
    ...getPreAuthCookieOptions(new Date(expiresAt)),
    value: token,
  });
}

export function buildAuditDetails(
  details?: Record<string, unknown>
): string | null {
  return details ? JSON.stringify(details) : null;
}

export async function auditUserEvent(input: {
  actor?: Pick<UserSummary, "id" | "username"> | null;
  subject?:
    Pick<UserSummary, "id" | "username"> | Pick<User, "id" | "username"> | null;
  action: string;
  resource?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await createUserAuditLog({
    actor_user_id: input.actor?.id ?? null,
    actor_username: input.actor?.username ?? null,
    subject_user_id: input.subject?.id ?? null,
    subject_username: input.subject?.username ?? null,
    action: input.action,
    resource: input.resource ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    details: buildAuditDetails(input.details),
  });
}

async function issuePreAuthChallenge(
  user: User,
  purpose: "password_change" | "mfa",
  code?: string
) {
  await deleteAuthChallengesForUser(user.id);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() +
      (purpose === "password_change" ? TEMP_PASSWORD_TTL_MS : MFA_TTL_MS)
  ).toISOString();

  await createAuthChallenge({
    user_id: user.id,
    purpose,
    token_hash: hashToken(token),
    code_hash: code ? hashPassword(code) : null,
    expires_at: expiresAt,
  });

  return { token, expiresAt };
}

async function issueMfaChallenge(
  user: User,
  req: NextRequest
): Promise<NextResponse> {
  if (!user.email) {
    throw new Error(
      "This account cannot use MFA until an email address is configured"
    );
  }

  const code = generateMfaCode();
  const challenge = await issuePreAuthChallenge(user, "mfa", code);
  const email = buildMfaEmail({
    username: user.username,
    code,
    expiresAt: challenge.expiresAt,
  });
  const emailResult = await sendEmail({ to: user.email, ...email });
  if (!emailResult.ok) {
    await deleteAuthChallengesForUser(user.id);
    throw new Error(emailResult.error ?? "Failed to send MFA code email");
  }

  const response = NextResponse.json({
    requiresMfa: true,
    message: "Verification code sent to your email address",
  });
  setPreAuthCookie(response, challenge.token, challenge.expiresAt);
  await auditUserEvent({
    actor: user,
    subject: user,
    action: "mfa_challenge_sent",
    resource: "auth/login",
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return response;
}

async function getPreAuthContext(purpose: "password_change" | "mfa") {
  await cleanupExpiredAuthChallenges();
  const token = await getPreAuthTokenFromCookies();
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const challenge = await getAuthChallengeByTokenHash(tokenHash, purpose);
  if (!challenge) {
    return null;
  }

  const user = await getUserById(challenge.user_id);
  if (!user || !user.is_active) {
    return null;
  }

  return { tokenHash, challenge, user };
}

export async function buildLoginResponse(
  user: User,
  req?: NextRequest
): Promise<NextResponse> {
  await touchUserLogin(user.id);
  const freshUser = (await getUserById(user.id)) ?? user;
  const response = NextResponse.json({
    user: {
      id: freshUser.id,
      username: freshUser.username,
      email: freshUser.email,
      role: freshUser.role,
      is_active: freshUser.is_active,
      mfa_enabled: freshUser.mfa_enabled,
      password_is_temporary: freshUser.password_is_temporary,
      password_expires_at: freshUser.password_expires_at,
      allowed_services: freshUser.allowed_services,
      created_at: freshUser.created_at,
      last_login_at: freshUser.last_login_at,
    },
  });
  await setSessionCookie(response, user.id);
  clearPreAuthCookie(response);

  if (req) {
    await auditUserEvent({
      actor: freshUser,
      subject: freshUser,
      action: "login_success",
      resource: "auth/login",
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }

  return response;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getCurrentUserFromSession();
}

export async function requireUser(
  minimumRole: UserRole = "viewer"
): Promise<SessionUser> {
  const user = await getCurrentUserFromSession();
  if (!user) {
    redirect("/login");
  }

  if (!hasRole(user.role, minimumRole)) {
    redirect("/dashboard");
  }

  return user;
}

export async function requireApiUser(
  minimumRole: UserRole = "viewer"
): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUserFromSession();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  if (!hasRole(user.role, minimumRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

export async function needsSetup(): Promise<boolean> {
  return (await countUsers()) === 0;
}

export async function createInitialAdmin(input: {
  username: string;
  email: string;
  password: string;
}): Promise<UserSummary> {
  if (!(await needsSetup())) {
    throw new Error("Initial setup has already been completed");
  }

  ensureValidUsername(input.username);
  const email = ensureValidEmail(input.email);
  ensureStrongPassword(input.password);

  return createInitialAdminUser({
    username: input.username.trim(),
    email,
    password_hash: hashPassword(input.password),
  });
}

export async function beginSignInWithPassword(
  req: NextRequest,
  input: { username: string; password: string }
): Promise<NextResponse> {
  const username = input.username.trim();
  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  if (!consumeLoginAttempt(ipAddress, username)) {
    await auditUserEvent({
      action: "login_rate_limited",
      resource: "auth/login",
      ipAddress,
      userAgent,
      details: { username },
    });
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 }
    );
  }

  const user = await getUserByUsername(username);

  if (
    !user ||
    !user.is_active ||
    !verifyPassword(input.password, user.password_hash)
  ) {
    await auditUserEvent({
      action: "login_failed",
      resource: "auth/login",
      ipAddress,
      userAgent,
      details: { username },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  clearLoginAttempts(ipAddress, username);

  if (user.password_is_temporary) {
    const expiresAt = user.password_expires_at
      ? new Date(user.password_expires_at).getTime()
      : 0;
    if (!expiresAt || expiresAt <= Date.now()) {
      await auditUserEvent({
        actor: user,
        subject: user,
        action: "temporary_password_expired",
        resource: "auth/login",
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        {
          error:
            "Temporary password has expired. Ask an admin to send a new one.",
        },
        { status: 401 }
      );
    }

    const challenge = await issuePreAuthChallenge(user, "password_change");
    const response = NextResponse.json({
      requiresPasswordChange: true,
      message: "Temporary password accepted. Set a new password to continue.",
    });
    setPreAuthCookie(response, challenge.token, challenge.expiresAt);
    await auditUserEvent({
      actor: user,
      subject: user,
      action: "temporary_password_login",
      resource: "auth/login",
      ipAddress,
      userAgent,
    });
    return response;
  }

  if (user.mfa_enabled) {
    return issueMfaChallenge(user, req);
  }

  return buildLoginResponse(user, req);
}

export async function completeTemporaryPasswordChange(
  req: NextRequest,
  input: { password: string }
): Promise<NextResponse> {
  const context = await getPreAuthContext("password_change");
  if (!context) {
    return NextResponse.json(
      { error: "Password change session has expired. Sign in again." },
      { status: 401 }
    );
  }

  ensureStrongPassword(input.password);
  if (verifyPassword(input.password, context.user.password_hash)) {
    return NextResponse.json(
      { error: "New password must be different from the temporary password" },
      { status: 400 }
    );
  }

  await updateUserPassword(context.user.id, hashPassword(input.password), {
    password_is_temporary: false,
    password_expires_at: null,
  });
  await deleteAuthChallenge(context.tokenHash);
  const updatedUser = await getUserById(context.user.id);
  if (!updatedUser) {
    throw new Error("Failed to load updated user");
  }

  await auditUserEvent({
    actor: updatedUser,
    subject: updatedUser,
    action: "password_changed_from_temporary",
    resource: "auth/change-password",
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  if (updatedUser.mfa_enabled) {
    return issueMfaChallenge(updatedUser, req);
  }

  return buildLoginResponse(updatedUser, req);
}

export async function verifyMfaCode(
  req: NextRequest,
  input: { code: string }
): Promise<NextResponse> {
  const context = await getPreAuthContext("mfa");
  if (!context || !context.challenge.code_hash) {
    return NextResponse.json(
      { error: "Verification session has expired. Sign in again." },
      { status: 401 }
    );
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  if (!consumeMfaAttempt(ipAddress, context.tokenHash)) {
    await auditUserEvent({
      actor: context.user,
      subject: context.user,
      action: "mfa_rate_limited",
      resource: "auth/mfa",
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: "Too many verification attempts. Sign in again." },
      { status: 429 }
    );
  }

  if (!verifyPassword(input.code.trim(), context.challenge.code_hash)) {
    await auditUserEvent({
      actor: context.user,
      subject: context.user,
      action: "mfa_failed",
      resource: "auth/mfa",
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: "Invalid verification code" },
      { status: 401 }
    );
  }

  clearMfaAttempts(ipAddress, context.tokenHash);
  await deleteAuthChallenge(context.tokenHash);
  await auditUserEvent({
    actor: context.user,
    subject: context.user,
    action: "mfa_verified",
    resource: "auth/mfa",
    ipAddress,
    userAgent,
  });
  return buildLoginResponse(context.user, req);
}

export async function buildLogoutResponse(
  req?: NextRequest
): Promise<NextResponse> {
  const sessionToken = await getSessionTokenFromCookies();
  const currentUser = await getCurrentUserFromSession();
  if (sessionToken) {
    await deleteAuthSession(hashToken(sessionToken));
  }

  const response = NextResponse.json({ status: "signed_out" });
  response.cookies.set({
    ...getSessionCookieOptions(new Date(0)),
    value: "",
    maxAge: 0,
  });
  clearPreAuthCookie(response);

  if (currentUser && req) {
    await auditUserEvent({
      actor: currentUser,
      subject: currentUser,
      action: "logout",
      resource: "auth/logout",
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }

  return response;
}

export function getRoleOptions(): UserRole[] {
  return ["viewer", "operator", "admin"];
}

export function canManageRole(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  return hasRole(actorRole, targetRole);
}

export function canAccessUserManagement(actorRole: UserRole): boolean {
  return actorRole === "admin" || actorRole === "operator";
}

export function canManageUserTarget(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  if (actorRole === "admin") return true;
  if (actorRole === "operator") return targetRole !== "admin";
  return false;
}

export async function auditPageAccess(
  user: SessionUser,
  resource: string,
  req?: NextRequest
): Promise<void> {
  if (!(await isAccessAuditEnabled())) {
    return;
  }

  await deleteUserAccessAuditLogsOlderThan(await getAccessAuditRetentionDays());
  const requestHeaders = req ? req.headers : await headers();
  await auditUserEvent({
    actor: user,
    subject: user,
    action: "page_access",
    resource,
    ipAddress: req ? getClientIp(req) : undefined,
    userAgent: requestHeaders.get("user-agent"),
  });
}
