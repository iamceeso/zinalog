"use client";

import { Globe } from "lucide-react";
import {
  Field,
  InfoBox,
  inputBase,
  SaveBar,
  SectionHeader,
  TestButton,
  Toggle,
} from "../shared";
import type { AllSettings, NotifChannel } from "../types";

export default function WebhookSettings({
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
          pointerEvents: settings.webhook_enabled === "1" ? "auto" : "none",
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
              onChange={(e) => set("webhook_method", e.target.value)}
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
            onChange={(e) => set("webhook_headers", e.target.value)}
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
            level, message, service, stack, metadata, created_at, source
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
              status={testStatus}
              onTest={sendTest}
            />
          ) : undefined
        }
      />
    </div>
  );
}
