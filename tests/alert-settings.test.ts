import assert from "node:assert/strict";
import test from "node:test";
import {
  isMaskedAlertSettingValue,
  sanitizeAlertSettingsForClient,
} from "../lib/alert-settings";

test("sanitizeAlertSettingsForClient masks sensitive alert settings", () => {
  const sanitized = sanitizeAlertSettingsForClient({
    smtp_host: "smtp.example.com",
    smtp_pass: "super-secret-password",
    resend_api_key: "re_1234567890abcdef",
    telegram_bot_token: "1234567890:telegram-secret-token",
    unrelated_key: "leave-me-out",
  });

  assert.equal(sanitized.smtp_host, "smtp.example.com");
  assert.equal(sanitized.smtp_pass, "••••••••");
  assert.equal(sanitized.resend_api_key, "re_••••••••••••••••••••");
  assert.equal(sanitized.telegram_bot_token, "••••••••••:••••••••••••••••••••");
  assert.equal("unrelated_key" in sanitized, false);
});

test("isMaskedAlertSettingValue only treats UI mask sentinels as preserved secrets", () => {
  assert.equal(isMaskedAlertSettingValue("smtp_pass", "••••••••"), true);
  assert.equal(isMaskedAlertSettingValue("resend_api_key", "re_••••••••••••••••••••"), true);
  assert.equal(
    isMaskedAlertSettingValue("telegram_bot_token", "••••••••••:••••••••••••••••••••"),
    true
  );
  assert.equal(isMaskedAlertSettingValue("smtp_pass", "real-password"), false);
  assert.equal(isMaskedAlertSettingValue("smtp_host", "smtp.example.com"), false);
});
