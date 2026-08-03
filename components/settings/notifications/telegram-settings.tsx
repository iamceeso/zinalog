"use client";

import { MessageSquare } from "lucide-react";
import {
  Field,
  InfoBox,
  PasswordInput,
  SaveBar,
  SectionHeader,
  TestButton,
  Toggle,
} from "../shared";
import type { AllSettings, NotifChannel } from "../types";

export default function TelegramSettings({
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
          pointerEvents: settings.telegram_enabled === "1" ? "auto" : "none",
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
            onChange={(e) => set("telegram_chat_id", e.target.value)}
            className="w-full bg-(--bg-surface) border border-(--border) rounded-lg px-3 py-2.25 text-[13px] text-foreground outline-none box-border transition-colors"
            placeholder="-1001234567890"
          />
        </Field>
        <InfoBox>
          To get your chat ID, forward a message to{" "}
          <strong>@userinfobot</strong> or add your bot to a group and send a
          message, then check{" "}
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
              status={testStatus}
              onTest={sendTest}
            />
          ) : undefined
        }
      />
    </div>
  );
}
