import {
  createApiKeyLookup,
  getDb,
  hashApiKey,
  verifyApiKeyHash,
  type ApiKey,
  type ApiKeySummary,
} from "./core";

export async function getApiKey(key: string): Promise<ApiKey | null> {
  const keyLookup = createApiKeyLookup(key);
  const database = await getDb();
  const apiKey =
    ((await database.get<ApiKey>(
      "SELECT * FROM api_keys WHERE key_lookup = ? AND is_active = 1",
      [keyLookup]
    )) as ApiKey | undefined) ?? null;

  if (!apiKey || !verifyApiKeyHash(key, apiKey.key_hash)) {
    return null;
  }

  return apiKey;
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const database = await getDb();
  return (await database.all<ApiKeySummary[]>(
    `SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     ORDER BY created_at DESC`
  )) as ApiKeySummary[];
}

export async function createApiKey(data: {
  name: string;
  rawKey: string;
  service?: string | null;
  allowed_ips?: string | null;
  rate_limit?: number;
  expires_at?: string | null;
}): Promise<ApiKeySummary> {
  const keyLookup = createApiKeyLookup(data.rawKey);
  const keyHash = hashApiKey(data.rawKey);
  const database = await getDb();
  const result = await database.run(
    `INSERT INTO api_keys (name, key_lookup, key_hash, service, allowed_ips, rate_limit, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      keyLookup,
      keyHash,
      data.service ?? null,
      data.allowed_ips ?? null,
      data.rate_limit ?? 1000,
      data.expires_at ?? null,
    ]
  );

  const created = (await database.get<ApiKeySummary>(
    `SELECT id, name, service, allowed_ips, rate_limit, is_active, created_at, expires_at, last_used_at, usage_count
     FROM api_keys
     WHERE id = ?`,
    [result.lastID]
  )) as ApiKeySummary | undefined;

  if (!created) {
    throw new Error("Failed to load created API key");
  }

  return created;
}

export async function deleteApiKey(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run("DELETE FROM api_keys WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

export async function revokeApiKey(id: number): Promise<boolean> {
  const database = await getDb();
  const result = await database.run(
    "UPDATE api_keys SET is_active = 0 WHERE id = ?",
    [id]
  );
  return (result.changes ?? 0) > 0;
}

export async function touchApiKey(id: number): Promise<void> {
  const database = await getDb();
  await database.run(
    "UPDATE api_keys SET last_used_at = datetime('now'), usage_count = usage_count + 1 WHERE id = ?",
    [id]
  );
}
