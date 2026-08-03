"use client";

import { ChevronRight, Hash } from "lucide-react";
import {
  Field,
  InfoBox,
  SaveBar,
  SectionHeader,
  TestButton,
  Toggle,
} from "../shared";
import type { AllSettings, NotifChannel } from "../types";

export default function SlackSettings({
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
          pointerEvents: settings.slack_enabled === "1" ? "auto" : "none",
        }}
      >
        <Field
          label="Webhook URL"
          hint={
            <>
              Create at api.slack.com/apps{" "}
              <ChevronRight size={11} className="inline align-middle" />{" "}
              Incoming Webhooks
            </>
          }
          required
        >
          <input
            type="url"
            value={settings.slack_webhook_url}
            onChange={(e) => set("slack_webhook_url", e.target.value)}
            className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
            placeholder="https://hooks.slack.com/services/..."
          />
        </Field>
        <InfoBox>
          Go to <strong>api.slack.com/apps</strong>{" "}
          <ChevronRight size={11} className="inline align-middle" /> Create an
          app <ChevronRight size={11} className="inline align-middle" />{" "}
          Incoming Webhooks{" "}
          <ChevronRight size={11} className="inline align-middle" /> Activate
          and copy the webhook URL.
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
              status={testStatus}
              onTest={sendTest}
            />
          ) : undefined
        }
      />
    </div>
  );
}
