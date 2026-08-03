"use client";

import { useState } from "react";
import { Bell, Globe, Hash, Mail, MessageSquare } from "lucide-react";
import { Field, inputBase, SaveBar, SectionHeader } from "./shared";
import DiscordSettings from "./notifications/discord-settings";
import EmailSettings from "./notifications/email-settings";
import SlackSettings from "./notifications/slack-settings";
import TelegramSettings from "./notifications/telegram-settings";
import WebhookSettings from "./notifications/webhook-settings";
import type { AllSettings, NotifChannel, TestStatus } from "./types";

const LEVEL_OPTIONS = ["error", "warning", "info", "debug"] as const;
const LEVEL_COLORS: Record<string, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--info)",
  debug: "var(--debug)",
};
const LEVEL_BG: Record<string, string> = {
  error: "rgba(248,81,73,0.12)",
  warning: "rgba(210,153,34,0.12)",
  info: "rgba(139,148,158,0.12)",
  debug: "rgba(121,192,255,0.12)",
};

const CHANNELS: {
  id: NotifChannel;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "email",
    label: "Email",
    icon: <Mail size={15} />,
    description: "SMTP or Resend",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: <MessageSquare size={15} />,
    description: "Bot API",
  },
  {
    id: "slack",
    label: "Slack",
    icon: <Hash size={15} />,
    description: "Incoming webhook",
  },
  {
    id: "discord",
    label: "Discord",
    icon: <MessageSquare size={15} />,
    description: "Webhook embed",
  },
  {
    id: "webhook",
    label: "Webhook",
    icon: <Globe size={15} />,
    description: "Custom HTTP",
  },
];

export default function NotificationsTab({
  settings,
  set,
  saveNotifications,
  savingNotif,
  savedNotif,
  testStatus,
  testing,
  sendTest,
}: {
  settings: AllSettings;
  set: <K extends keyof AllSettings>(key: K, val: AllSettings[K]) => void;
  saveNotifications: () => void;
  savingNotif: boolean;
  savedNotif: boolean;
  testStatus: TestStatus;
  testing: NotifChannel | null;
  sendTest: (channel: NotifChannel) => void;
}) {
  const [activeChannel, setActiveChannel] = useState<NotifChannel>("email");

  const toggleLevel = (level: string) => {
    const current = settings.alert_levels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const next = current.includes(level)
      ? current.filter((l) => l !== level)
      : [...current, level];
    set("alert_levels", next.join(","));
  };

  const selectedLevels = settings.alert_levels
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  const enabledChannels: Set<NotifChannel> = new Set();
  if (settings.email_provider !== "disabled") enabledChannels.add("email");
  if (settings.telegram_enabled === "1") enabledChannels.add("telegram");
  if (settings.slack_enabled === "1") enabledChannels.add("slack");
  if (settings.discord_enabled === "1") enabledChannels.add("discord");
  if (settings.webhook_enabled === "1") enabledChannels.add("webhook");

  const sharedProps = {
    settings,
    set,
    saveNotifications,
    savingNotif,
    savedNotif,
    testing,
    sendTest,
  };

  return (
    <div
      className="notif-layout"
      style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
    >
      {/* Channel list */}
      <div
        className="notif-channel-list"
        style={{
          width: 180,
          flexShrink: 0,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {CHANNELS.map((ch, i) => {
          const active = activeChannel === ch.id;
          const enabled = enabledChannels.has(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                background: active ? "rgba(88,166,255,0.08)" : "transparent",
                border: "none",
                borderBottom:
                  i < CHANNELS.length - 1 ? "1px solid var(--border)" : "none",
                borderLeft: active
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  color: active ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                {ch.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {ch.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-dim)",
                    marginTop: 1,
                  }}
                >
                  {ch.description}
                </div>
              </div>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: enabled ? "var(--success)" : "var(--border)",
                  flexShrink: 0,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Channel config panel */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {activeChannel === "email" && (
          <EmailSettings {...sharedProps} testStatus={testStatus.email} />
        )}
        {activeChannel === "telegram" && (
          <TelegramSettings {...sharedProps} testStatus={testStatus.telegram} />
        )}
        {activeChannel === "slack" && (
          <SlackSettings {...sharedProps} testStatus={testStatus.slack} />
        )}
        {activeChannel === "discord" && (
          <DiscordSettings {...sharedProps} testStatus={testStatus.discord} />
        )}
        {activeChannel === "webhook" && (
          <WebhookSettings {...sharedProps} testStatus={testStatus.webhook} />
        )}

        {/*  Alert Rules (shared)  */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "22px 24px",
          }}
        >
          <SectionHeader
            icon={<Bell size={15} />}
            title="Alert Rules"
            description="Shared rules that apply to all enabled notification channels."
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <Field label="Trigger alerts for">
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                {LEVEL_OPTIONS.map((lvl) => {
                  const active = selectedLevels.includes(lvl);
                  return (
                    <button
                      key={lvl}
                      onClick={() => toggleLevel(lvl)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.6px",
                        cursor: "pointer",
                        border: active
                          ? `1px solid ${LEVEL_COLORS[lvl]}55`
                          : "1px solid var(--border)",
                        background: active
                          ? LEVEL_BG[lvl]
                          : "var(--bg-surface)",
                        color: active ? LEVEL_COLORS[lvl] : "var(--text-dim)",
                        fontFamily: "var(--font-mono, monospace)",
                        transition: "all 0.15s",
                      }}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <Field
                label="Occurrence threshold"
                hint="Logs required before alerting"
              >
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={settings.alert_threshold}
                    onChange={(e) => set("alert_threshold", e.target.value)}
                    style={{ ...inputBase, paddingRight: 48 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      pointerEvents: "none",
                    }}
                  >
                    logs
                  </span>
                </div>
              </Field>
              <Field
                label="Cooldown period"
                hint="Minimum gap between repeat alerts"
              >
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={settings.alert_cooldown}
                    onChange={(e) => set("alert_cooldown", e.target.value)}
                    style={{ ...inputBase, paddingRight: 44 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      pointerEvents: "none",
                    }}
                  >
                    min
                  </span>
                </div>
              </Field>
            </div>
          </div>
          <SaveBar
            onSave={saveNotifications}
            saving={savingNotif}
            saved={savedNotif}
          />
        </div>
      </div>
    </div>
  );
}
