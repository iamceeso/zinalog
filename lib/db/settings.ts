import {
  decryptSecret,
  encryptSecret,
  SENSITIVE_SETTING_KEYS,
} from "../secret-crypto";
import { getDb, withTransaction, type SqliteDatabase } from "./core";

export async function getSettingFromDb(
  database: SqliteDatabase,
  key: string
): Promise<string | null> {
  const row = (await database.get<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  )) as { value: string } | undefined;

  const raw = row?.value ?? null;
  if (raw === null) return null;
  return SENSITIVE_SETTING_KEYS.has(key) ? decryptSecret(raw) : raw;
}

export async function getSetting(key: string): Promise<string | null> {
  return getSettingFromDb(await getDb(), key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  const stored = SENSITIVE_SETTING_KEYS.has(key) ? encryptSecret(value) : value;
  await database.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, stored]
  );
}

export async function setSettings(
  pairs: Record<string, string>
): Promise<void> {
  const database = await getDb();

  await withTransaction(database, async () => {
    for (const [key, value] of Object.entries(pairs)) {
      const stored = SENSITIVE_SETTING_KEYS.has(key)
        ? encryptSecret(value)
        : value;
      await database.run(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, stored]
      );
    }
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const database = await getDb();
  const rows = (await database.all<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings"
  )) as { key: string; value: string }[];

  return Object.fromEntries(
    rows.map((row) => [
      row.key,
      SENSITIVE_SETTING_KEYS.has(row.key)
        ? decryptSecret(row.value)
        : row.value,
    ])
  );
}

async function parsePositiveSetting(
  key: string,
  fallback: number
): Promise<number> {
  const rawValue = await getSetting(key);
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.floor(parsedValue);
}

export async function isAccessAuditEnabled(): Promise<boolean> {
  return (await getSetting("access_audit_enabled")) !== "0";
}

export async function getSessionIdleTimeoutMinutes(): Promise<number> {
  return parsePositiveSetting("session_idle_timeout_minutes", 30);
}

export async function getAccessAuditRetentionDays(): Promise<number> {
  return parsePositiveSetting("access_audit_retention_days", 30);
}
