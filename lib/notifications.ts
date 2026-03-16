import { getAllSettings } from "./db";
import { sendEmail, getEmailConfig, buildAlertEmail } from "./email";

export interface AlertLog {
  level: string;
  message: string;
  service: string | null;
  stack: string | null;
  metadata: string | null;
  created_at: string;
}

const LEVEL_COLORS: Record<string, number> = {
  error: 0xf85149,
  warning: 0xd29922,
  info: 0x8b949e,
  debug: 0x79c0ff,
};
const LEVEL_EMOJI: Record<string, string> = {
  error: "🔴",
  warning: "🟡",
  info: "🔵",
  debug: "⚪",
};

//  Telegram

export async function sendTelegram(
  log: AlertLog,
): Promise<{ ok: boolean; error?: string }> {
  const s = await getAllSettings();
  const token = s.telegram_bot_token ?? "";
  const chatId = s.telegram_chat_id ?? "";
  if (!token || !chatId) return { ok: false, error: "Telegram not configured" };

  const service = log.service ?? "unknown";
  const emoji = LEVEL_EMOJI[log.level] ?? "⚪";
  const msg = [
    `${emoji} *[${log.level.toUpperCase()}]* — ${escTg(log.message)}`,
    `📦 *Service:* \`${escTg(service)}\``,
    `🕐 \`${log.created_at}\``,
    log.stack ? `\n\`\`\`\n${log.stack.slice(0, 800)}\n\`\`\`` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: "MarkdownV2",
        }),
      },
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escTg(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

//  Slack
export async function sendSlack(
  log: AlertLog,
): Promise<{ ok: boolean; error?: string }> {
  const s = await getAllSettings();
  const url = s.slack_webhook_url ?? "";
  if (!url) return { ok: false, error: "Slack webhook URL not configured" };

  const service = log.service ?? "unknown";
  const emoji = LEVEL_EMOJI[log.level] ?? "⚪";
  const levelColors: Record<string, string> = {
    error: "danger",
    warning: "warning",
    info: "good",
    debug: "#79c0ff",
  };

  const body = {
    attachments: [
      {
        color: levelColors[log.level] ?? "#8b949e",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${log.level.toUpperCase()}* — ${log.message}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service*\n\`${service}\`` },
              { type: "mrkdwn", text: `*Time*\n\`${log.created_at}\`` },
            ],
          },
          ...(log.stack
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Stack trace*\n\`\`\`${log.stack.slice(0, 1000)}\`\`\``,
                  },
                },
              ]
            : []),
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Sent by *ZinaLog*" }],
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return res.ok
      ? { ok: true }
      : { ok: false, error: text || `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

//  Discord

export async function sendDiscord(
  log: AlertLog,
): Promise<{ ok: boolean; error?: string }> {
  const s = await getAllSettings();
  const url = s.discord_webhook_url ?? "";
  if (!url) return { ok: false, error: "Discord webhook URL not configured" };

  const service = log.service ?? "unknown";
  const color = LEVEL_COLORS[log.level] ?? 0x8b949e;

  const embed: Record<string, unknown> = {
    title: `${LEVEL_EMOJI[log.level] ?? "⚪"} ${log.level.toUpperCase()}: ${log.message.slice(0, 200)}`,
    color,
    fields: [
      { name: "Service", value: `\`${service}\``, inline: true },
      { name: "Time", value: `\`${log.created_at}\``, inline: true },
    ],
    footer: { text: "ZinaLog" },
    timestamp: new Date().toISOString(),
  };

  if (log.stack) {
    embed.description = `\`\`\`\n${log.stack.slice(0, 1000)}\n\`\`\``;
  }

  if (log.metadata) {
    try {
      const parsed = JSON.parse(log.metadata);
      (embed.fields as unknown[]).push({
        name: "Metadata",
        value: `\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 500)}\n\`\`\``,
        inline: false,
      });
    } catch {
      /* ignore */
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (res.ok || res.status === 204) return { ok: true };
    const text = await res.text();
    return { ok: false, error: text || `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

//  Custom Webhook

export async function sendWebhook(
  log: AlertLog,
): Promise<{ ok: boolean; error?: string }> {
  const s = await getAllSettings();
  const url = s.webhook_url ?? "";
  if (!url) return { ok: false, error: "Webhook URL not configured" };

  const method = s.webhook_method ?? "POST";

  let extraHeaders: Record<string, string> = {};
  if (s.webhook_headers) {
    try {
      extraHeaders = JSON.parse(s.webhook_headers);
    } catch {
      /* ignore */
    }
  }

  const payload = {
    level: log.level,
    message: log.message,
    service: log.service,
    stack: log.stack,
    metadata: log.metadata
      ? (() => {
          try {
            return JSON.parse(log.metadata!);
          } catch {
            return log.metadata;
          }
        })()
      : null,
    created_at: log.created_at,
    source: "zinalog",
  };

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: method !== "GET" ? JSON.stringify(payload) : undefined,
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

//  Dispatcher

export type Channel = "email" | "telegram" | "slack" | "discord" | "webhook";

export interface ChannelResult {
  channel: Channel;
  ok: boolean;
  error?: string;
}

/** Fire all enabled channels for a given log. */
export async function sendAllNotifications(
  log: AlertLog,
): Promise<ChannelResult[]> {
  const s = await getAllSettings();
  const results: ChannelResult[] = [];

  const tasks: Promise<void>[] = [];

  // Email
  const emailCfg = await getEmailConfig();
  if (emailCfg.provider !== "disabled" && emailCfg.to) {
    tasks.push(
      (async () => {
        const { subject, html } = buildAlertEmail(log);
        const r = await sendEmail({ to: emailCfg.to, subject, html });
        results.push({ channel: "email", ...r });
      })(),
    );
  }

  // Telegram
  if (s.telegram_enabled === "1") {
    tasks.push(
      (async () => {
        const r = await sendTelegram(log);
        results.push({ channel: "telegram", ...r });
      })(),
    );
  }

  // Slack
  if (s.slack_enabled === "1") {
    tasks.push(
      (async () => {
        const r = await sendSlack(log);
        results.push({ channel: "slack", ...r });
      })(),
    );
  }

  // Discord
  if (s.discord_enabled === "1") {
    tasks.push(
      (async () => {
        const r = await sendDiscord(log);
        results.push({ channel: "discord", ...r });
      })(),
    );
  }

  // Webhook
  if (s.webhook_enabled === "1") {
    tasks.push(
      (async () => {
        const r = await sendWebhook(log);
        results.push({ channel: "webhook", ...r });
      })(),
    );
  }

  await Promise.allSettled(tasks);
  return results;
}

/** Send a test notification to a single channel. */
export async function sendTestNotification(
  channel: Channel,
): Promise<{ ok: boolean; error?: string }> {
  const testLog: AlertLog = {
    level: "error",
    message: "This is a test alert from ZinaLog",
    service: "zinalog-test",
    stack: null,
    metadata: JSON.stringify({
      test: true,
      timestamp: new Date().toISOString(),
    }),
    created_at: new Date().toISOString(),
  };

  switch (channel) {
    case "email": {
      const cfg = await getEmailConfig();
      if (cfg.provider === "disabled")
        return { ok: false, error: "Email provider not configured" };
      if (!cfg.to) return { ok: false, error: "No recipient configured" };
      const { subject, html } = buildAlertEmail(testLog);
      return sendEmail({
        to: cfg.to,
        subject: "ZinaLog — Test: " + subject,
        html,
      });
    }
    case "telegram":
      return sendTelegram(testLog);
    case "slack":
      return sendSlack(testLog);
    case "discord":
      return sendDiscord(testLog);
    case "webhook":
      return sendWebhook(testLog);
    default:
      return { ok: false, error: "Unknown channel" };
  }
}
