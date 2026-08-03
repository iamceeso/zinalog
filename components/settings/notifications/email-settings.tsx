"use client";

import { Mail, Send, Server, XCircle } from "lucide-react";
import {
  Field,
  PasswordInput,
  SaveBar,
  SectionHeader,
  TestButton,
} from "../shared";
import type { AllSettings, NotifChannel } from "../types";

export default function EmailSettings({
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
  testStatus: { ok: boolean; msg: string } | null;
  testing: NotifChannel | null;
  sendTest: (channel: NotifChannel) => void;
}) {
  return (
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
                color: active ? "var(--accent)" : "var(--text-muted)",
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
              {p === "disabled" ? "Disabled" : p === "smtp" ? "SMTP" : "Resend"}
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
          <div style={{ height: 1, background: "var(--border)" }} />
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
                onChange={(e) => set("email_from", e.target.value)}
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
                    onChange={(e) => set("smtp_host", e.target.value)}
                    className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
                    placeholder="smtp.example.com"
                  />
                </Field>
                <Field label="Port" required>
                  <input
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) => set("smtp_port", e.target.value)}
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
                <Field label="Username" hint="Leave blank if no auth">
                  <input
                    type="text"
                    value={settings.smtp_user}
                    onChange={(e) => set("smtp_user", e.target.value)}
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
                    set("smtp_secure", e.target.checked ? "1" : "0")
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
              status={testStatus}
              onTest={sendTest}
            />
          ) : undefined
        }
      />
    </div>
  );
}
