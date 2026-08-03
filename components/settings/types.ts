export interface GeneralSettings {
  retention_days: string;
  max_logs: string;
  session_idle_timeout_minutes: string;
}

export interface AllSettings {
  // Email
  email_provider: string;
  email_from: string;
  email_to: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: string;
  smtp_user: string;
  smtp_pass: string;
  resend_api_key: string;
  // Alert rules
  alert_levels: string;
  alert_threshold: string;
  alert_cooldown: string;
  // Telegram
  telegram_enabled: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  // Slack
  slack_enabled: string;
  slack_webhook_url: string;
  // Discord
  discord_enabled: string;
  discord_webhook_url: string;
  // Webhook
  webhook_enabled: string;
  webhook_url: string;
  webhook_headers: string;
  webhook_method: string;
}

export type Tab = "general" | "notifications" | "danger";
export type NotifChannel =
  "email" | "telegram" | "slack" | "discord" | "webhook";

export type TestStatus = Record<
  NotifChannel,
  { ok: boolean; msg: string } | null
>;
