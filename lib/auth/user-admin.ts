import { randomBytes } from "crypto";
import {
  countAdmins,
  countActiveAdmins,
  createUser,
  deleteAuthChallengesForUser,
  deleteAuthSessionsForUser,
  deleteUser,
  getUserById,
  listUserAuditLogs,
  listUsers,
  setUserActive,
  updateUserAllowedServices,
  updateUserEmail,
  updateUserMfaEnabled,
  updateUserPassword,
  updateUserRole,
  type UserAuditLog,
  type UserRole,
  type UserSummary,
} from "../db";
import { buildUserInviteEmail, sendEmail } from "../email";
import {
  auditUserEvent,
  ensureStrongPassword,
  ensureValidEmail,
  ensureValidUsername,
  hashPassword,
  TEMP_PASSWORD_TTL_MS,
  type SessionUser,
} from "./session";

function normalizeManagedUserAllowedServices(
  input: unknown
): string[] | null | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input === null) {
    return null;
  }

  if (!Array.isArray(input)) {
    throw new Error(
      "Field 'allowed_services' must be an array of service names or null"
    );
  }

  const normalized = Array.from(
    new Set(
      input.map((value) => {
        if (typeof value !== "string") {
          throw new Error(
            "Field 'allowed_services' must only contain service names"
          );
        }

        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error(
            "Field 'allowed_services' must not contain empty service names"
          );
        }

        return trimmed;
      })
    )
  ).sort((left, right) => left.localeCompare(right));

  return normalized;
}

function pickRandomCharacter(source: string): string {
  return source[randomBytes(1)[0] % source.length];
}

function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()-_=+";
  const all = `${upper}${lower}${numbers}${symbols}`;
  const chars = [
    pickRandomCharacter(upper),
    pickRandomCharacter(lower),
    pickRandomCharacter(numbers),
    pickRandomCharacter(symbols),
    ...Array.from({ length: 12 }, () => pickRandomCharacter(all)),
  ];

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBytes(1)[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join("");
}

export async function listManagedUsers(): Promise<UserSummary[]> {
  return listUsers();
}

export async function listAuditLogs(limit = 100): Promise<UserAuditLog[]> {
  return listUserAuditLogs(limit);
}

export async function createManagedUser(input: {
  username: string;
  email: string;
  role: UserRole;
  mfa_enabled: boolean;
  allowed_services?: unknown;
  actor: SessionUser;
  origin: string;
}): Promise<UserSummary> {
  ensureValidUsername(input.username);
  const email = ensureValidEmail(input.email);
  const allowedServices = normalizeManagedUserAllowedServices(
    input.allowed_services
  );

  const temporaryPassword = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString();
  const createdUser = await createUser({
    username: input.username.trim(),
    email,
    password_hash: hashPassword(temporaryPassword),
    role: input.role,
    mfa_enabled: input.mfa_enabled,
    password_is_temporary: true,
    password_expires_at: expiresAt,
    allowed_services: allowedServices ?? null,
  });

  const inviteEmail = buildUserInviteEmail({
    username: createdUser.username,
    temporaryPassword,
    expiresAt,
    loginUrl: `${input.origin}/login`,
  });
  const emailResult = await sendEmail({ to: email, ...inviteEmail });
  if (!emailResult.ok) {
    await deleteUser(createdUser.id);
    throw new Error(emailResult.error ?? "Failed to send invite email");
  }

  await auditUserEvent({
    actor: input.actor,
    subject: createdUser,
    action: "user_created",
    resource: "users/create",
    details: {
      role: input.role,
      mfa_enabled: input.mfa_enabled,
      email,
      allowed_services: createdUser.allowed_services,
    },
  });

  return createdUser;
}

export async function updateManagedUserRole(
  id: number,
  role: UserRole,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;
  if (user.role === "admin" && role !== "admin" && (await countAdmins()) <= 1) {
    throw new Error("You must keep at least one active admin");
  }

  const changed = await updateUserRole(id, role);
  if (changed) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_role_changed",
      resource: "users/update",
      details: { previous_role: user.role, role },
    });
  }
  return changed;
}

export async function updateManagedUserEmail(
  id: number,
  email: string,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;

  const normalizedEmail = ensureValidEmail(email);
  const changed = await updateUserEmail(id, normalizedEmail);
  if (changed) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_email_changed",
      resource: "users/update",
      details: { previous_email: user.email, email: normalizedEmail },
    });
  }
  return changed;
}

export async function updateManagedUserServiceAccess(
  id: number,
  allowedServicesInput: unknown,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;

  const allowedServices =
    normalizeManagedUserAllowedServices(allowedServicesInput);
  if (allowedServices === undefined) {
    throw new Error("Field 'allowed_services' is required");
  }

  const changed = await updateUserAllowedServices(id, allowedServices);
  if (changed) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_service_access_changed",
      resource: "users/update",
      details: {
        previous_allowed_services: user.allowed_services,
        allowed_services: allowedServices,
      },
    });
  }

  return changed;
}

export async function updateManagedUserMfa(
  id: number,
  enabled: boolean,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;
  if (enabled && !user.email) {
    throw new Error(
      "User must have an email address before MFA can be enabled"
    );
  }

  const changed = await updateUserMfaEnabled(id, enabled);
  if (changed) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_mfa_changed",
      resource: "users/update",
      details: {
        previous_mfa_enabled: !!user.mfa_enabled,
        mfa_enabled: enabled,
      },
    });
  }
  return changed;
}

export async function updateManagedUserPassword(
  id: number,
  password: string,
  actor?: SessionUser
): Promise<boolean> {
  ensureStrongPassword(password);
  const user = await getUserById(id);
  if (!user) return false;

  const changed = await updateUserPassword(id, hashPassword(password), {
    password_is_temporary: false,
    password_expires_at: null,
  });
  if (changed) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_password_changed",
      resource: "users/update",
    });
  }
  return changed;
}

export async function sendManagedUserPasswordReset(input: {
  id: number;
  actor: SessionUser;
  origin: string;
}): Promise<boolean> {
  const user = await getUserById(input.id);
  if (!user) {
    return false;
  }
  if (!user.email) {
    throw new Error(
      "User must have an email address before a reset email can be sent"
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString();
  const previousPasswordHash = user.password_hash;
  const previousPasswordIsTemporary = !!user.password_is_temporary;
  const previousPasswordExpiresAt = user.password_expires_at;

  await updateUserPassword(user.id, hashPassword(temporaryPassword), {
    password_is_temporary: true,
    password_expires_at: expiresAt,
  });
  await deleteAuthSessionsForUser(user.id);
  await deleteAuthChallengesForUser(user.id);

  const inviteEmail = buildUserInviteEmail({
    username: user.username,
    temporaryPassword,
    expiresAt,
    loginUrl: `${input.origin}/login`,
  });
  const emailResult = await sendEmail({ to: user.email, ...inviteEmail });
  if (!emailResult.ok) {
    await updateUserPassword(user.id, previousPasswordHash, {
      password_is_temporary: previousPasswordIsTemporary,
      password_expires_at: previousPasswordExpiresAt,
    });
    throw new Error(emailResult.error ?? "Failed to send reset email");
  }

  await auditUserEvent({
    actor: input.actor,
    subject: user,
    action: "user_reset_email_sent",
    resource: "users/reset-password",
    details: { expires_at: expiresAt },
  });

  return true;
}

export async function updateManagedUserActive(
  id: number,
  isActive: boolean,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;
  if (user.role === "admin" && !isActive && (await countActiveAdmins()) <= 1) {
    throw new Error("You must keep at least one active admin");
  }

  const success = await setUserActive(id, isActive);
  if (success && !isActive) {
    await deleteAuthSessionsForUser(id);
    await deleteAuthChallengesForUser(id);
  }
  if (success) {
    await auditUserEvent({
      actor,
      subject: user,
      action: isActive ? "user_enabled" : "user_disabled",
      resource: "users/update",
    });
  }
  return success;
}

export async function deleteManagedUser(
  id: number,
  actor?: SessionUser
): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) return false;
  if (user.role === "admin" && (await countAdmins()) <= 1) {
    throw new Error("You must keep at least one active admin");
  }

  await deleteAuthSessionsForUser(id);
  await deleteAuthChallengesForUser(id);
  const deleted = await deleteUser(id);
  if (deleted) {
    await auditUserEvent({
      actor,
      subject: user,
      action: "user_deleted",
      resource: "users/delete",
      details: { deleted_user_id: user.id, deleted_username: user.username },
    });
  }

  return deleted;
}
