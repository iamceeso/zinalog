// Re-exports the public surface previously defined directly in this file.
// Implementation now lives in domain modules:
//   ./db/core     connection singleton, schema/migrations, shared types & helpers
//   ./db/logs     log ingestion, querying, stats, retention
//   ./db/api-keys API key issuance/verification
//   ./db/settings application settings (incl. encrypted secrets)
//   ./db/users    users, sessions, auth challenges, audit logs
//   ./db/monitors uptime monitor CRUD, checks, uptime stats
export {
  getDb,
  type ApiKey,
  type ApiKeySummary,
  type AuthChallenge,
  type AuthSession,
  type Log,
  type LogFilters,
  type User,
  type UserAuditLog,
  type UserRole,
  type UserSummary,
} from "./db/core";

export {
  checkAndSetCooldown,
  countRecentLogs,
  deleteOldLogs,
  exportLogs,
  getErrorGroups,
  getLogGroups,
  getServices,
  getStats,
  insertLog,
  queryLogs,
  trimLogsToMax,
} from "./db/logs";

export {
  createApiKey,
  deleteApiKey,
  getApiKey,
  listApiKeys,
  revokeApiKey,
  touchApiKey,
} from "./db/api-keys";

export {
  getAccessAuditRetentionDays,
  getAllSettings,
  getSessionIdleTimeoutMinutes,
  getSetting,
  isAccessAuditEnabled,
  setSetting,
  setSettings,
} from "./db/settings";

export {
  cleanupExpiredAuthChallenges,
  cleanupExpiredAuthSessions,
  countActiveAdmins,
  countAdmins,
  countUsers,
  createAuthChallenge,
  createAuthSession,
  createInitialAdminUser,
  createUser,
  createUserAuditLog,
  deleteAllUserAccessAuditLogs,
  deleteAuthChallenge,
  deleteAuthChallengesForUser,
  deleteAuthSession,
  deleteAuthSessionsForUser,
  deleteUser,
  deleteUserAccessAuditLogsOlderThan,
  getAuthChallengeByTokenHash,
  getUserByEmail,
  getUserById,
  getUserBySessionTokenHash,
  getUserByUsername,
  listUserAccessAuditLogs,
  listUserAuditLogs,
  listUsers,
  setUserActive,
  touchAuthSession,
  touchUserLogin,
  updateUserAllowedServices,
  updateUserEmail,
  updateUserMfaEnabled,
  updateUserPassword,
  updateUserRole,
} from "./db/users";

export {
  createMonitor,
  deleteMonitor,
  getDueMonitors,
  getMonitorById,
  getMonitorsDueForDomainRefresh,
  getMonitorUptimeStats,
  getMonitorUptimeStatsByPeriod,
  listMonitorChecks,
  listMonitors,
  listRecentChecksAcrossMonitors,
  recordMonitorCheck,
  updateMonitor,
  updateMonitorDomainInfo,
  type Monitor,
  type MonitorCheck,
  type MonitorCheckOutcome,
  type MonitorCheckResult,
  type MonitorListItem,
  type MonitorPeriodStats,
  type MonitorStatsPeriod,
  type MonitorStatus,
  type MonitorType,
  type RecentMonitorCheck,
} from "./db/monitors";
