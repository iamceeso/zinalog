import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type * as DbModuleType from "../lib/db";
import type * as NotificationsModuleType from "../lib/notifications";

type DbModule = typeof DbModuleType;
type NotificationsModule = typeof NotificationsModuleType;

const compiledDbPath = path.resolve(__dirname, "../lib/db.js");
const compiledNotificationsPath = path.resolve(
  __dirname,
  "../lib/notifications.js"
);
const compiledEmailPath = path.resolve(__dirname, "../lib/email.js");
const compiledSecretCryptoPath = path.resolve(
  __dirname,
  "../lib/secret-crypto.js"
);

const cjsRequire = createRequire(__filename);
const TEST_ENCRYPTION_KEY = "c".repeat(64);
const ALL_COMPILED_PATHS = [
  compiledDbPath,
  compiledNotificationsPath,
  compiledEmailPath,
  compiledSecretCryptoPath,
];

const alertLog: NotificationsModuleType.AlertLog = {
  level: "error",
  message: "Deploy failed - needs rollback",
  service: "zinalog-test",
  stack: "Error: bad - thing",
  metadata: JSON.stringify({ test: true }),
  created_at: "2026-08-02T12:34:56.000Z",
};

async function withNotificationModules(
  fn: (modules: {
    db: DbModule;
    notifications: NotificationsModule;
    fetchCalls: Array<{ url: string; init: RequestInit }>;
  }) => Promise<void>
): Promise<void> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinalog-notifications-test-")
  );
  const databasePath = path.join(tempDir, "logs.db");
  const originalFetch = globalThis.fetch;

  process.env.NODE_ENV = "production";
  process.env.DATABASE_PATH = databasePath;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  delete global.__dbPromise;
  for (const p of ALL_COMPILED_PATHS) delete cjsRequire.cache[p];

  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    fetchCalls.push({ url: String(input), init: init ?? {} });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => "ok",
    } as Response;
  }) as typeof fetch;

  const db = cjsRequire(compiledDbPath) as DbModule;
  const notifications = cjsRequire(
    compiledNotificationsPath
  ) as NotificationsModule;

  try {
    await fn({ db, notifications, fetchCalls });
  } finally {
    try {
      const database = await db.getDb();
      await database.close();
    } catch {
      /* already closed */
    }
    globalThis.fetch = originalFetch;
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_PATH;
    delete process.env.ENCRYPTION_KEY;
    delete global.__dbPromise;
    for (const p of ALL_COMPILED_PATHS) delete cjsRequire.cache[p];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function postedJson<T>(call: { init: RequestInit }): T {
  const body = call.init.body;
  if (typeof body !== "string") {
    throw new TypeError("Expected request body to be a JSON string");
  }
  return JSON.parse(body) as T;
}

test("sendTelegram escapes only Telegram MarkdownV2-sensitive text", async () => {
  await withNotificationModules(async ({ db, notifications, fetchCalls }) => {
    await db.setSettings({
      telegram_bot_token: "123456:ABC-DEF",
      telegram_chat_id: "chat-1",
    });

    const result = await notifications.sendTelegram(alertLog);

    assert.equal(result.ok, true);
    assert.equal(fetchCalls.length, 1);
    assert.match(
      fetchCalls[0].url,
      /^https:\/\/api\.telegram\.org\/bot123456:ABC-DEF\/sendMessage$/
    );

    const body = postedJson<{
      chat_id: string;
      text: string;
      parse_mode: string;
    }>(fetchCalls[0]);

    assert.equal(body.chat_id, "chat-1");
    assert.equal(body.parse_mode, "MarkdownV2");
    assert.match(body.text, /\*\\\[ERROR\\\]\* \\-/);
    assert.match(body.text, /Deploy failed \\- needs rollback/);
    assert.match(body.text, /`zinalog-test`/);
    assert.match(body.text, /`2026-08-02T12:34:56.000Z`/);
  });
});

test("sendSlack keeps Slack mrkdwn payload unchanged", async () => {
  await withNotificationModules(async ({ db, notifications, fetchCalls }) => {
    await db.setSetting("slack_webhook_url", "https://hooks.example/slack");

    const result = await notifications.sendSlack(alertLog);

    assert.equal(result.ok, true);
    const body = postedJson<{
      attachments: Array<{
        blocks: Array<{
          text?: { text: string };
          fields?: Array<{ text: string }>;
        }>;
      }>;
    }>(fetchCalls[0]);

    const blocks = body.attachments[0].blocks;
    assert.equal(
      blocks[0].text?.text,
      "🔴 *ERROR* - Deploy failed - needs rollback"
    );
    assert.equal(blocks[1].fields?.[0].text, "*Service*\n`zinalog-test`");
    assert.equal(
      blocks[1].fields?.[1].text,
      "*Time*\n`2026-08-02T12:34:56.000Z`"
    );
  });
});

test("sendDiscord keeps Discord embed payload unchanged", async () => {
  await withNotificationModules(async ({ db, notifications, fetchCalls }) => {
    await db.setSetting("discord_webhook_url", "https://hooks.example/discord");

    const result = await notifications.sendDiscord(alertLog);

    assert.equal(result.ok, true);
    const body = postedJson<{
      embeds: Array<{
        title: string;
        fields: Array<{ name: string; value: string }>;
      }>;
    }>(fetchCalls[0]);

    const embed = body.embeds[0];
    assert.equal(embed.title, "🔴 ERROR: Deploy failed - needs rollback");
    assert.deepEqual(embed.fields.slice(0, 2), [
      { name: "Service", value: "`zinalog-test`", inline: true },
      { name: "Time", value: "`2026-08-02T12:34:56.000Z`", inline: true },
    ]);
  });
});

test("sendWebhook keeps raw alert fields unchanged", async () => {
  await withNotificationModules(async ({ db, notifications, fetchCalls }) => {
    await db.setSettings({
      webhook_url: "https://hooks.example/custom",
      webhook_method: "POST",
    });

    const result = await notifications.sendWebhook(alertLog);

    assert.equal(result.ok, true);
    const body = postedJson<{
      level: string;
      message: string;
      service: string;
      created_at: string;
    }>(fetchCalls[0]);

    assert.equal(body.level, "error");
    assert.equal(body.message, "Deploy failed - needs rollback");
    assert.equal(body.service, "zinalog-test");
    assert.equal(body.created_at, "2026-08-02T12:34:56.000Z");
  });
});
