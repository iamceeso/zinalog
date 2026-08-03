"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Bell, ChevronRight, Settings } from "lucide-react";
import DangerTab from "@/components/settings/danger-tab";
import GeneralTab from "@/components/settings/general-tab";
import NotificationsTab from "@/components/settings/notifications-tab";
import type {
  AllSettings,
  GeneralSettings,
  Tab,
  TestStatus,
  NotifChannel,
} from "@/components/settings/types";

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings size={14} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={14} /> },
  { id: "danger", label: "Danger Zone", icon: <AlertTriangle size={14} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
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
  const [testStatus, setTestStatus] = useState<TestStatus>({
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
          {activeTab === "general" && (
            <GeneralTab
              general={general}
              setGeneral={setGeneral}
              saveGeneral={saveGeneral}
              saving={saving}
              saved={saved}
            />
          )}

          {activeTab === "notifications" && (
            <NotificationsTab
              settings={settings}
              set={set}
              saveNotifications={saveNotifications}
              savingNotif={savingNotif}
              savedNotif={savedNotif}
              testStatus={testStatus}
              testing={testing}
              sendTest={sendTest}
            />
          )}

          {activeTab === "danger" && <DangerTab />}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
