"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import {
  Field,
  InfoBox,
  SaveBar,
  SectionHeader,
  TestButton,
  Toggle,
} from "../shared";
import type { AllSettings, NotifChannel } from "../types";

export default function DiscordSettings({
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
          pointerEvents: settings.discord_enabled === "1" ? "auto" : "none",
        }}
      >
        <Field
          label="Webhook URL"
          hint={
            <>
              Create in Discord channel settings{" "}
              <ChevronRight size={11} className="inline align-middle" />{" "}
              Integrations{" "}
              <ChevronRight size={11} className="inline align-middle" />{" "}
              Webhooks
            </>
          }
          required
        >
          <input
            type="url"
            value={settings.discord_webhook_url}
            onChange={(e) => set("discord_webhook_url", e.target.value)}
            className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
            placeholder="https://discord.com/api/webhooks/..."
          />
        </Field>
        <InfoBox>
          In Discord, open a channel{" "}
          <ChevronRight size={11} className="inline align-middle" />{" "}
          <strong>
            Edit Channel{" "}
            <ChevronRight size={11} className="inline align-middle" />{" "}
            Integrations{" "}
            <ChevronRight size={11} className="inline align-middle" /> Webhooks{" "}
            <ChevronRight size={11} className="inline align-middle" /> New
            Webhook
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
              status={testStatus}
              onTest={sendTest}
            />
          ) : undefined
        }
      />
    </div>
  );
}
