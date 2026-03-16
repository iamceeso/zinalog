"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Trash2,
  AlertTriangle,
  Mail,
  Send,
  CheckCircle,
  Settings,
  Bell,
  Database,
  Server,
  ChevronRight,
  XCircle,
  Eye,
  EyeOff,
  MessageSquare,
  Globe,
  ToggleLeft,
  ToggleRight,
  Hash,
} from "lucide-react";
import ConfirmModal from "@/components/confirm-modal";

interface GeneralSettings {
  retention_days: string;
  max_logs: string;
  session_idle_timeout_minutes: string;
}

interface AllSettings {
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

type Tab = "general" | "notifications" | "danger";
type NotifChannel = "email" | "telegram" | "slack" | "discord" | "webhook";

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

const inputBase: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--text-base)",
  outline: "none",
  transition: "border-color 0.15s",
  boxSizing: "border-box",
};

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <label className="text-[12px] font-medium text-(--text-muted) tracking-[0.3px]">
          {label}
        </label>
        {required && (
          <span style={{ color: "var(--error)", fontSize: 11 }}>*</span>
        )}
      </div>
      {children}
      {hint && (
        <p className="text-[11px] text-(--text-dim) leading-normal m-0">
          {hint}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div className="w-8 h-8 rounded-lg bg-[rgba(88,166,255,0.1)] border border-[rgba(88,166,255,0.15)] flex items-center justify-center text-(--accent) shrink-0">
          {icon}
        </div>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-base)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          margin: "0 0 0 42px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "new-password"}
        style={{ ...inputBase, paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-(--text-dim) p-0 flex"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SaveBar({
  onSave,
  saving,
  saved,
  extra,
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-5 border-t border-(--border) mt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className={`
    flex items-center gap-1.75 rounded-lg px-5 py-2.25
    text-[13px] font-semibold transition-all duration-200
    ${
      saved
        ? "bg-[rgba(63,185,80,0.15)] border border-[rgba(63,185,80,0.3)] text-(--success)"
        : "bg-(--accent-glow) text-white"
    }
    ${saving ? "cursor-not-allowed opacity-[0.65]" : "cursor-pointer"}
  `}
      >
        {saved ? <CheckCircle size={14} /> : <Save size={14} />}
        {saved ? "Saved" : saving ? "Saving…" : "Save changes"}
      </button>
      {extra}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [activeChannel, setActiveChannel] = useState<NotifChannel>("email");
  const [general, setGeneral] = useState<GeneralSettings>({
    retention_days: "30",
    max_logs: "100000",
    session_idle_timeout_minutes: "30",
  });
  const [settings, setSettingsState] = useState<AllSettings>({
    email_provider: "disabled",
    email_from: "zinalog@example.com",
    email_to: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_secure: "0",
    smtp_user: "",
    smtp_pass: "",
    resend_api_key: "",
    alert_levels: "error",
    alert_threshold: "1",
    alert_cooldown: "15",
    telegram_enabled: "0",
    telegram_bot_token: "",
    telegram_chat_id: "",
    slack_enabled: "0",
    slack_webhook_url: "",
    discord_enabled: "0",
    discord_webhook_url: "",
    webhook_enabled: "0",
    webhook_url: "",
    webhook_headers: "",
    webhook_method: "POST",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [savedNotif, setSavedNotif] = useState(false);
  const [purgeDays, setPurgeDays] = useState("30");
  const [purgeResult, setPurgeResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [purging, setPurging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [testStatus, setTestStatus] = useState<
    Record<NotifChannel, { ok: boolean; msg: string } | null>
  >({
    email: null,
    telegram: null,
    slack: null,
    discord: null,
    webhook: null,
  });
  const [testing, setTesting] = useState<NotifChannel | null>(null);

  const set = <K extends keyof AllSettings>(key: K, val: AllSettings[K]) =>
    setSettingsState((s) => ({ ...s, [key]: val }));

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/alerts").then((r) => r.json()),
    ]).then(([ret, notif]) => {
      setGeneral(ret);
      setSettingsState((s) => ({ ...s, ...notif }));
      setLoading(false);
    });
  }, []);

  const saveGeneral = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(general),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveNotifications = async () => {
    setSavingNotif(true);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSavingNotif(false);
    setSavedNotif(true);
    setTimeout(() => setSavedNotif(false), 2500);
  };

  const sendTest = async (channel: NotifChannel) => {
    setTesting(channel);
    setTestStatus((s) => ({ ...s, [channel]: null }));
    const res = await fetch(`/api/alerts/test?channel=${channel}`, {
      method: "POST",
    });
    const data = await res.json();
    setTestStatus((s) => ({
      ...s,
      [channel]: res.ok
        ? { ok: true, msg: `Test sent via ${channel}` }
        : { ok: false, msg: data.error ?? "Failed" },
    }));
    setTesting(null);
  };

  const doPurge = async () => {
    setShowConfirm(false);
    setPurging(true);
    setPurgeResult(null);
    const res = await fetch(`/api/settings?days=${purgeDays}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setPurgeResult({
      ok: res.ok,
      msg: data.message ?? (res.ok ? "Done" : "Error"),
    });
    setPurging(false);
  };

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

  const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings size={14} /> },
    { id: "notifications", label: "Notifications", icon: <Bell size={14} /> },
    { id: "danger", label: "Danger Zone", icon: <AlertTriangle size={14} /> },
  ];

  // Which channels are enabled (for badge display)
  const enabledChannels: Set<NotifChannel> = new Set();
  if (settings.email_provider !== "disabled") enabledChannels.add("email");
  if (settings.telegram_enabled === "1") enabledChannels.add("telegram");
  if (settings.slack_enabled === "1") enabledChannels.add("slack");
  if (settings.discord_enabled === "1") enabledChannels.add("discord");
  if (settings.webhook_enabled === "1") enabledChannels.add("webhook");

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 300,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            color: "var(--text-dim)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: "2px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <span style={{ fontSize: 13 }}>Loading settings…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-base)",
            margin: "0 0 4px",
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
          Manage session behavior, log retention, notification channels, and
          system configuration
        </p>
      </div>

      <div
        className="settings-layout"
        style={{ display: "flex", gap: 24, alignItems: "flex-start" }}
      >
        {/* Left Nav */}
        <nav
          className="settings-nav"
          style={{
            width: 200,
            flexShrink: 0,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {NAV.map((item, i) => {
            const active = activeTab === item.id;
            const isDanger = item.id === "danger";
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 14px",
                  background: active
                    ? isDanger
                      ? "rgba(248,81,73,0.08)"
                      : "rgba(88,166,255,0.08)"
                    : "transparent",
                  border: "none",
                  borderBottom:
                    i < NAV.length - 1 ? "1px solid var(--border)" : "none",
                  borderLeft: active
                    ? `2px solid ${isDanger ? "var(--error)" : "var(--accent)"}`
                    : "2px solid transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? isDanger
                      ? "var(--error)"
                      : "var(--accent)"
                    : "var(--text-muted)",
                  textAlign: "left",
                  transition: "all 0.15s",
                  boxSizing: "border-box",
                }}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/*  General  */}
          {activeTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "22px 24px",
                }}
              >
                <SectionHeader
                  icon={<Settings size={15} />}
                  title="Session"
                  description="Control how long a signed-in user can stay idle before zinalog requires them to log in again."
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 360px)",
                    gap: 16,
                  }}
                >
                  <Field
                    label="Idle timeout"
                    hint="Users are logged out after this many minutes without activity"
                    required
                  >
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={general.session_idle_timeout_minutes}
                        onChange={(e) =>
                          setGeneral((s) => ({
                            ...s,
                            session_idle_timeout_minutes: e.target.value,
                          }))
                        }
                        style={{ ...inputBase, paddingRight: 58 }}
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
                        minutes
                      </span>
                    </div>
                  </Field>
                </div>
                <SaveBar onSave={saveGeneral} saving={saving} saved={saved} />
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "22px 24px",
                }}
              >
                <SectionHeader
                  icon={<Database size={15} />}
                  title="Log Retention"
                  description="Control how long logs are kept and the maximum storage size."
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <Field
                    label="Retention period"
                    hint="Logs older than this are automatically purged"
                    required
                  >
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={general.retention_days}
                        onChange={(e) =>
                          setGeneral((s) => ({
                            ...s,
                            retention_days: e.target.value,
                          }))
                        }
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
                        days
                      </span>
                    </div>
                  </Field>
                  <Field
                    label="Max log count"
                    hint="Oldest entries are removed when this is exceeded"
                    required
                  >
                    <input
                      type="number"
                      min="1000"
                      value={general.max_logs}
                      onChange={(e) =>
                        setGeneral((s) => ({
                          ...s,
                          max_logs: e.target.value,
                        }))
                      }
                      className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                    />
                  </Field>
                </div>
                <SaveBar onSave={saveGeneral} saving={saving} saved={saved} />
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "22px 24px",
                }}
              >
                <SectionHeader
                  icon={<Server size={15} />}
                  title="System Information"
                  description="Read-only runtime environment details."
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  {[
                    {
                      label: "Database Path",
                      value: process.env.DATABASE_PATH ?? "./data/logs.db",
                      mono: true,
                    },
                    {
                      label: "Port",
                      value: process.env.PORT ?? "4000",
                      mono: true,
                    },
                    {
                      label: "Environment",
                      value: process.env.NODE_ENV ?? "development",
                      mono: false,
                    },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 14px",
                        background:
                          i % 2 === 0
                            ? "transparent"
                            : "rgba(255,255,255,0.015)",
                        borderBottom:
                          i < 2 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-dim)",
                          width: 140,
                          flexShrink: 0,
                        }}
                      >
                        {item.label}
                      </span>
                      <code
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          fontFamily: item.mono
                            ? "var(--font-mono, monospace)"
                            : "inherit",
                        }}
                      >
                        {item.value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/*  Notifications  */}
          {activeTab === "notifications" && (
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
                        background: active
                          ? "rgba(88,166,255,0.08)"
                          : "transparent",
                        border: "none",
                        borderBottom:
                          i < CHANNELS.length - 1
                            ? "1px solid var(--border)"
                            : "none",
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
                            color: active
                              ? "var(--accent)"
                              : "var(--text-muted)",
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
                          background: enabled
                            ? "var(--success)"
                            : "var(--border)",
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
                {/*  Email  */}
                {activeChannel === "email" && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "22px 24px",
                    }}
                  >
                    <SectionHeader
                      icon={<Mail size={15} />}
                      title="Email Alerts"
                      description="Send alert emails via SMTP or Resend when log thresholds are exceeded."
                    />

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3,1fr)",
                        gap: 10,
                        marginBottom: 20,
                      }}
                    >
                      {(["disabled", "smtp", "resend"] as const).map((p) => {
                        const active = settings.email_provider === p;
                        return (
                          <button
                            key={p}
                            onClick={() => set("email_provider", p)}
                            style={{
                              padding: "12px 10px",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: active ? 600 : 400,
                              cursor: "pointer",
                              border: active
                                ? "1px solid var(--accent)"
                                : "1px solid var(--border)",
                              background: active
                                ? "rgba(88,166,255,0.08)"
                                : "var(--bg-surface)",
                              color: active
                                ? "var(--accent)"
                                : "var(--text-muted)",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 8,
                              transition: "all 0.15s",
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: active
                                  ? "rgba(88,166,255,0.15)"
                                  : "rgba(255,255,255,0.04)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {p === "disabled" ? (
                                <XCircle size={14} />
                              ) : p === "smtp" ? (
                                <Server size={14} />
                              ) : (
                                <Send size={14} />
                              )}
                            </div>
                            {p === "disabled"
                              ? "Disabled"
                              : p === "smtp"
                                ? "SMTP"
                                : "Resend"}
                          </button>
                        );
                      })}
                    </div>

                    {settings.email_provider !== "disabled" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        <div
                          style={{ height: 1, background: "var(--border)" }}
                        />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 14,
                          }}
                        >
                          <Field label="From address" required>
                            <input
                              type="email"
                              value={settings.email_from}
                              onChange={(e) =>
                                set("email_from", e.target.value)
                              }
                              className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                              placeholder="alerts@yourapp.com"
                            />
                          </Field>
                          <Field label="Recipient" required>
                            <input
                              type="email"
                              value={settings.email_to}
                              onChange={(e) => set("email_to", e.target.value)}
                              className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                              placeholder="you@example.com"
                            />
                          </Field>
                        </div>
                        {settings.email_provider === "smtp" && (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 90px",
                                gap: 14,
                              }}
                            >
                              <Field label="SMTP host" required>
                                <input
                                  type="text"
                                  value={settings.smtp_host}
                                  onChange={(e) =>
                                    set("smtp_host", e.target.value)
                                  }
                                  className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                                  placeholder="smtp.example.com"
                                />
                              </Field>
                              <Field label="Port" required>
                                <input
                                  type="number"
                                  value={settings.smtp_port}
                                  onChange={(e) =>
                                    set("smtp_port", e.target.value)
                                  }
                                  className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                                />
                              </Field>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 14,
                              }}
                            >
                              <Field
                                label="Username"
                                hint="Leave blank if no auth"
                              >
                                <input
                                  type="text"
                                  value={settings.smtp_user}
                                  onChange={(e) =>
                                    set("smtp_user", e.target.value)
                                  }
                                  className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                                  placeholder="username"
                                  autoComplete="off"
                                />
                              </Field>
                              <Field label="Password">
                                <PasswordInput
                                  value={settings.smtp_pass}
                                  onChange={(v) => set("smtp_pass", v)}
                                  placeholder="••••••••"
                                />
                              </Field>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 14px",
                                background: "var(--bg-surface)",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                              }}
                            >
                              <input
                                id="smtp-tls"
                                type="checkbox"
                                checked={settings.smtp_secure === "1"}
                                onChange={(e) =>
                                  set(
                                    "smtp_secure",
                                    e.target.checked ? "1" : "0",
                                  )
                                }
                                style={{
                                  accentColor: "var(--accent)",
                                  width: 15,
                                  height: 15,
                                  cursor: "pointer",
                                }}
                              />
                              <label
                                htmlFor="smtp-tls"
                                style={{
                                  fontSize: 13,
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                Use TLS / Secure connection
                              </label>
                              <span
                                style={{
                                  marginLeft: "auto",
                                  fontSize: 11,
                                  color: "var(--text-dim)",
                                }}
                              >
                                Recommended for port 465
                              </span>
                            </div>
                          </>
                        )}
                        {settings.email_provider === "resend" && (
                          <Field
                            label="Resend API key"
                            hint="Generate at resend.com/api-keys"
                            required
                          >
                            <PasswordInput
                              value={settings.resend_api_key}
                              onChange={(v) => set("resend_api_key", v)}
                              placeholder="re_••••••••••••••••••••"
                            />
                          </Field>
                        )}
                      </div>
                    )}

                    <SaveBar
                      onSave={saveNotifications}
                      saving={savingNotif}
                      saved={savedNotif}
                      extra={
                        settings.email_provider !== "disabled" ? (
                          <TestButton
                            channel="email"
                            testing={testing}
                            status={testStatus.email}
                            onTest={sendTest}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {/*  Telegram  */}
                {activeChannel === "telegram" && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "22px 24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 20,
                      }}
                    >
                      <SectionHeader
                        icon={<MessageSquare size={15} />}
                        title="Telegram"
                        description="Send alerts to a Telegram chat via Bot API."
                      />
                      <Toggle
                        value={settings.telegram_enabled === "1"}
                        onChange={(v) => set("telegram_enabled", v ? "1" : "0")}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        opacity: settings.telegram_enabled === "1" ? 1 : 0.45,
                        pointerEvents:
                          settings.telegram_enabled === "1" ? "auto" : "none",
                      }}
                    >
                      <Field
                        label="Bot token"
                        hint="Create a bot with @BotFather and copy the token"
                        required
                      >
                        <PasswordInput
                          value={settings.telegram_bot_token}
                          onChange={(v) => set("telegram_bot_token", v)}
                          placeholder="1234567890:ABCdef..."
                        />
                      </Field>
                      <Field
                        label="Chat ID"
                        hint="The chat, group, or channel ID to send messages to"
                        required
                      >
                        <input
                          type="text"
                          value={settings.telegram_chat_id}
                          onChange={(e) =>
                            set("telegram_chat_id", e.target.value)
                          }
                          className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                          placeholder="-1001234567890"
                        />
                      </Field>
                      <InfoBox>
                        To get your chat ID, forward a message to{" "}
                        <strong>@userinfobot</strong> or add your bot to a group
                        and send a message, then check{" "}
                        <code style={{ fontSize: 11 }}>
                          https://api.telegram.org/bot&#123;TOKEN&#125;/getUpdates
                        </code>
                      </InfoBox>
                    </div>
                    <SaveBar
                      onSave={saveNotifications}
                      saving={savingNotif}
                      saved={savedNotif}
                      extra={
                        settings.telegram_enabled === "1" ? (
                          <TestButton
                            channel="telegram"
                            testing={testing}
                            status={testStatus.telegram}
                            onTest={sendTest}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {/*  Slack  */}
                {activeChannel === "slack" && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "22px 24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 20,
                      }}
                    >
                      <SectionHeader
                        icon={<Hash size={15} />}
                        title="Slack"
                        description="Post alerts to a Slack channel using an incoming webhook."
                      />
                      <Toggle
                        value={settings.slack_enabled === "1"}
                        onChange={(v) => set("slack_enabled", v ? "1" : "0")}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        opacity: settings.slack_enabled === "1" ? 1 : 0.45,
                        pointerEvents:
                          settings.slack_enabled === "1" ? "auto" : "none",
                      }}
                    >
                      <Field
                        label="Webhook URL"
                        hint="Create at api.slack.com/apps → Incoming Webhooks"
                        required
                      >
                        <input
                          type="url"
                          value={settings.slack_webhook_url}
                          onChange={(e) =>
                            set("slack_webhook_url", e.target.value)
                          }
                          className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                          placeholder="https://hooks.slack.com/services/..."
                        />
                      </Field>
                      <InfoBox>
                        Go to <strong>api.slack.com/apps</strong> → Create an
                        app → Incoming Webhooks → Activate and copy the webhook
                        URL.
                      </InfoBox>
                    </div>
                    <SaveBar
                      onSave={saveNotifications}
                      saving={savingNotif}
                      saved={savedNotif}
                      extra={
                        settings.slack_enabled === "1" ? (
                          <TestButton
                            channel="slack"
                            testing={testing}
                            status={testStatus.slack}
                            onTest={sendTest}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {/*  Discord  */}
                {activeChannel === "discord" && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "22px 24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 20,
                      }}
                    >
                      <SectionHeader
                        icon={<MessageSquare size={15} />}
                        title="Discord"
                        description="Post rich embed alerts to a Discord channel via webhook."
                      />
                      <Toggle
                        value={settings.discord_enabled === "1"}
                        onChange={(v) => set("discord_enabled", v ? "1" : "0")}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        opacity: settings.discord_enabled === "1" ? 1 : 0.45,
                        pointerEvents:
                          settings.discord_enabled === "1" ? "auto" : "none",
                      }}
                    >
                      <Field
                        label="Webhook URL"
                        hint="Create in Discord channel settings → Integrations → Webhooks"
                        required
                      >
                        <input
                          type="url"
                          value={settings.discord_webhook_url}
                          onChange={(e) =>
                            set("discord_webhook_url", e.target.value)
                          }
                          className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                          placeholder="https://discord.com/api/webhooks/..."
                        />
                      </Field>
                      <InfoBox>
                        In Discord, open a channel →{" "}
                        <strong>
                          Edit Channel → Integrations → Webhooks → New Webhook
                        </strong>
                        . Copy the webhook URL.
                      </InfoBox>
                    </div>
                    <SaveBar
                      onSave={saveNotifications}
                      saving={savingNotif}
                      saved={savedNotif}
                      extra={
                        settings.discord_enabled === "1" ? (
                          <TestButton
                            channel="discord"
                            testing={testing}
                            status={testStatus.discord}
                            onTest={sendTest}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {/*  Webhook  */}
                {activeChannel === "webhook" && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "22px 24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 20,
                      }}
                    >
                      <SectionHeader
                        icon={<Globe size={15} />}
                        title="Custom Webhook"
                        description="POST a JSON payload to any HTTP endpoint when an alert fires."
                      />
                      <Toggle
                        value={settings.webhook_enabled === "1"}
                        onChange={(v) => set("webhook_enabled", v ? "1" : "0")}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        opacity: settings.webhook_enabled === "1" ? 1 : 0.45,
                        pointerEvents:
                          settings.webhook_enabled === "1" ? "auto" : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px",
                          gap: 14,
                        }}
                      >
                        <Field label="Endpoint URL" required>
                          <input
                            type="url"
                            value={settings.webhook_url}
                            onChange={(e) => set("webhook_url", e.target.value)}
                            className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                            placeholder="https://your-service.com/hook"
                          />
                        </Field>
                        <Field label="Method">
                          <select
                            value={settings.webhook_method}
                            onChange={(e) =>
                              set("webhook_method", e.target.value)
                            }
                            className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors pointer-cursor"
                          >
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                          </select>
                        </Field>
                      </div>
                      <Field
                        label="Custom headers"
                        hint='Optional JSON object, e.g. {"Authorization": "Bearer token"}'
                      >
                        <textarea
                          value={settings.webhook_headers}
                          onChange={(e) =>
                            set("webhook_headers", e.target.value)
                          }
                          rows={3}
                          style={{
                            ...inputBase,
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: 12,
                            resize: "vertical",
                          }}
                          placeholder={'{"X-Api-Key": "secret"}'}
                        />
                      </Field>
                      <InfoBox>
                        ZinaLog will POST a JSON body with fields:{" "}
                        <code style={{ fontSize: 11 }}>
                          level, message, service, stack, metadata, created_at,
                          source
                        </code>
                      </InfoBox>
                    </div>
                    <SaveBar
                      onSave={saveNotifications}
                      saving={savingNotif}
                      saved={savedNotif}
                      extra={
                        settings.webhook_enabled === "1" ? (
                          <TestButton
                            channel="webhook"
                            testing={testing}
                            status={testStatus.webhook}
                            onTest={sendTest}
                          />
                        ) : undefined
                      }
                    />
                  </div>
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
                                color: active
                                  ? LEVEL_COLORS[lvl]
                                  : "var(--text-dim)",
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
                            onChange={(e) =>
                              set("alert_threshold", e.target.value)
                            }
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
                            onChange={(e) =>
                              set("alert_cooldown", e.target.value)
                            }
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
          )}

          {/*  Danger Zone  */}
          {activeTab === "danger" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid rgba(248,81,73,0.25)",
                  borderRadius: 10,
                  padding: "22px 24px",
                }}
              >
                <SectionHeader
                  icon={<AlertTriangle size={15} />}
                  title="Danger Zone"
                  description="These actions are permanent and cannot be undone. Proceed with caution."
                />
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "16px 18px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-base)",
                      marginBottom: 4,
                    }}
                  >
                    Purge old logs
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-dim)",
                      margin: "0 0 16px",
                      lineHeight: 1.6,
                    }}
                  >
                    Permanently delete all log entries older than the specified
                    number of days. The deleted logs cannot be recovered.
                  </p>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Delete logs older than
                    </span>
                    <div style={{ position: "relative", width: 88 }}>
                      <input
                        type="number"
                        min="1"
                        value={purgeDays}
                        onChange={(e) => setPurgeDays(e.target.value)}
                        style={{
                          ...inputBase,
                          paddingRight: 22,
                          width: "100%",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 11,
                          color: "var(--text-dim)",
                          pointerEvents: "none",
                        }}
                      >
                        d
                      </span>
                    </div>
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={purging}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        background: "rgba(248,81,73,0.1)",
                        border: "1px solid rgba(248,81,73,0.3)",
                        borderRadius: 8,
                        padding: "9px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--error)",
                        cursor: purging ? "not-allowed" : "pointer",
                        opacity: purging ? 0.65 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Trash2 size={13} />
                      {purging ? "Deleting…" : "Purge logs"}
                    </button>
                  </div>
                  {purgeResult && (
                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: purgeResult.ok
                          ? "var(--success)"
                          : "var(--error)",
                        padding: "9px 14px",
                        background: purgeResult.ok
                          ? "rgba(63,185,80,0.08)"
                          : "rgba(248,81,73,0.08)",
                        border: `1px solid ${purgeResult.ok ? "rgba(63,185,80,0.2)" : "rgba(248,81,73,0.2)"}`,
                        borderRadius: 6,
                      }}
                    >
                      {purgeResult.ok ? (
                        <CheckCircle size={13} />
                      ) : (
                        <XCircle size={13} />
                      )}
                      {purgeResult.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Purge Old Logs"
          message={`This will permanently delete all logs older than ${purgeDays} day${purgeDays === "1" ? "" : "s"}. This action cannot be undone.`}
          confirmLabel="Yes, purge logs"
          danger
          onConfirm={doPurge}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

//  Sub-components

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: value ? "var(--success)" : "var(--text-dim)",
          fontWeight: 500,
        }}
      >
        {value ? "Enabled" : "Disabled"}
      </span>
      {value ? (
        <ToggleRight size={22} color="var(--success)" />
      ) : (
        <ToggleLeft size={22} color="var(--text-dim)" />
      )}
    </button>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(88,166,255,0.05)",
        border: "1px solid rgba(88,166,255,0.15)",
        borderRadius: 8,
        fontSize: 12,
        color: "var(--text-muted)",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function TestButton({
  channel,
  testing,
  status,
  onTest,
}: {
  channel: NotifChannel;
  testing: NotifChannel | null;
  status: { ok: boolean; msg: string } | null;
  onTest: (c: NotifChannel) => void;
}) {
  const isLoading = testing === channel;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onTest(channel)}
        disabled={isLoading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          color: "var(--text-muted)",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.65 : 1,
        }}
      >
        <Send size={13} />
        {isLoading ? "Sending…" : "Send test"}
      </button>
      {status && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: status.ok ? "var(--success)" : "var(--error)",
            padding: "6px 12px",
            background: status.ok
              ? "rgba(63,185,80,0.08)"
              : "rgba(248,81,73,0.08)",
            border: `1px solid ${status.ok ? "rgba(63,185,80,0.2)" : "rgba(248,81,73,0.2)"}`,
            borderRadius: 6,
          }}
        >
          {status.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {status.msg}
        </div>
      )}
    </div>
  );
}
