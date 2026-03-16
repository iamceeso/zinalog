"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const alert_settings_1 = require("../lib/alert-settings");
(0, node_test_1.default)("sanitizeAlertSettingsForClient masks sensitive alert settings", () => {
    const sanitized = (0, alert_settings_1.sanitizeAlertSettingsForClient)({
        smtp_host: "smtp.example.com",
        smtp_pass: "super-secret-password",
        resend_api_key: "re_1234567890abcdef",
        telegram_bot_token: "1234567890:telegram-secret-token",
        unrelated_key: "leave-me-out",
    });
    strict_1.default.equal(sanitized.smtp_host, "smtp.example.com");
    strict_1.default.equal(sanitized.smtp_pass, "••••••••");
    strict_1.default.equal(sanitized.resend_api_key, "re_••••••••••••••••••••");
    strict_1.default.equal(sanitized.telegram_bot_token, "••••••••••:••••••••••••••••••••");
    strict_1.default.equal("unrelated_key" in sanitized, false);
});
(0, node_test_1.default)("isMaskedAlertSettingValue only treats UI mask sentinels as preserved secrets", () => {
    strict_1.default.equal((0, alert_settings_1.isMaskedAlertSettingValue)("smtp_pass", "••••••••"), true);
    strict_1.default.equal((0, alert_settings_1.isMaskedAlertSettingValue)("resend_api_key", "re_••••••••••••••••••••"), true);
    strict_1.default.equal((0, alert_settings_1.isMaskedAlertSettingValue)("telegram_bot_token", "••••••••••:••••••••••••••••••••"), true);
    strict_1.default.equal((0, alert_settings_1.isMaskedAlertSettingValue)("smtp_pass", "real-password"), false);
    strict_1.default.equal((0, alert_settings_1.isMaskedAlertSettingValue)("smtp_host", "smtp.example.com"), false);
});
