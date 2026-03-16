"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_ALERT_SETTING_KEYS = void 0;
exports.maskAlertSettingValue = maskAlertSettingValue;
exports.isMaskedAlertSettingValue = isMaskedAlertSettingValue;
exports.sanitizeAlertSettingsForClient = sanitizeAlertSettingsForClient;
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
];
exports.ALL_ALERT_SETTING_KEYS = [...ALERT_SETTING_KEYS];
const SENSITIVE_ALERT_SETTING_KEYS = new Set([
    "smtp_pass",
    "resend_api_key",
    "telegram_bot_token",
]);
const MASKED_VALUES = {
    smtp_pass: "••••••••",
};
function maskAlertSettingValue(key, value) {
    if (!value)
        return value;
    if (key === "resend_api_key")
        return `re_${"•".repeat(20)}`;
    if (key === "telegram_bot_token")
        return `${"•".repeat(10)}:${"•".repeat(20)}`;
    if (MASKED_VALUES[key])
        return MASKED_VALUES[key];
    return value;
}
function isMaskedAlertSettingValue(key, value) {
    if (key === "smtp_pass")
        return value === "••••••••";
    if (key === "resend_api_key")
        return value.startsWith("re_•");
    if (key === "telegram_bot_token")
        return value.startsWith("••••••••••");
    return false;
}
function sanitizeAlertSettingsForClient(settings) {
    const sanitized = Object.fromEntries(exports.ALL_ALERT_SETTING_KEYS.map((key) => [key, settings[key] ?? ""]));
    for (const key of SENSITIVE_ALERT_SETTING_KEYS) {
        if (sanitized[key]) {
            sanitized[key] = maskAlertSettingValue(key, sanitized[key]);
        }
    }
    return sanitized;
}
