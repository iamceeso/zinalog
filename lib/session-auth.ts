// Re-exports the public surface previously defined directly in this file.
// Implementation now lives in ./auth/session (cookies/tokens/login/MFA) and
// ./auth/user-admin (user management CRUD).
export type { SessionUser } from "./auth/session";
export {
  buildLoginResponse,
  getCurrentUser,
  requireUser,
  requireApiUser,
  needsSetup,
  createInitialAdmin,
  beginSignInWithPassword,
  completeTemporaryPasswordChange,
  verifyMfaCode,
  buildLogoutResponse,
  getRoleOptions,
  canManageRole,
  canAccessUserManagement,
  canManageUserTarget,
  auditPageAccess,
} from "./auth/session";
export {
  listManagedUsers,
  listAuditLogs,
  createManagedUser,
  updateManagedUserRole,
  updateManagedUserEmail,
  updateManagedUserServiceAccess,
  updateManagedUserMfa,
  updateManagedUserPassword,
  sendManagedUserPasswordReset,
  updateManagedUserActive,
  deleteManagedUser,
} from "./auth/user-admin";
