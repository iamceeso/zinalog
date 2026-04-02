const ALERT_SETTING_KEYS = [
  "email_provider",
  "email_from",
  "email_to",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_pass",
  "resend_api_key",
  "alert_levels",
  "alert_threshold",
  "alert_cooldown",
  "telegram_enabled",
  "telegram_bot_token",
  "telegram_chat_id",
  "slack_enabled",
  "slack_webhook_url",
  "discord_enabled",
  "discord_webhook_url",
  "webhook_enabled",
  "webhook_url",
  "webhook_headers",
  "webhook_method",
] as const;

export const ALL_ALERT_SETTING_KEYS = [...ALERT_SETTING_KEYS];

const SENSITIVE_ALERT_SETTING_KEYS = new Set<string>([
  "smtp_user",
  "smtp_pass",
  "resend_api_key",
  "telegram_bot_token",
  "slack_webhook_url",
  "discord_webhook_url",
  "webhook_url",
  "webhook_headers",
]);

const MASKED_VALUES: Record<string, string> = {
  smtp_user: "********************",
  smtp_pass: "********************",
  slack_webhook_url: "********************",
  discord_webhook_url: "********************",
  webhook_url: "********************",
  webhook_headers: "********************",
};

export function maskAlertSettingValue(key: string, value: string): string {
  if (!value) return value;
  if (key === "resend_api_key") return "re_********************";
  if (key === "telegram_bot_token") return "********************:********************";
  if (MASKED_VALUES[key]) return MASKED_VALUES[key];
  return value;
}

export function isMaskedAlertSettingValue(key: string, value: string): boolean {
  if (key === "resend_api_key") return value === "re_********************";
  if (key === "telegram_bot_token") return value === "********************:********************";
  if (MASKED_VALUES[key]) return value === MASKED_VALUES[key];
  return false;
}

export function sanitizeAlertSettingsForClient(
  settings: Record<string, string>,
): Record<string, string> {
  const sanitized = Object.fromEntries(
    ALL_ALERT_SETTING_KEYS.map((key) => [key, settings[key] ?? ""]),
  );

  for (const key of SENSITIVE_ALERT_SETTING_KEYS) {
    if (sanitized[key]) {
      sanitized[key] = maskAlertSettingValue(key, sanitized[key]);
    }
  }

  return sanitized;
}
