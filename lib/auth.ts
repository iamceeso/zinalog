import { NextRequest } from "next/server";
import { getApiKey, touchApiKey, ApiKey } from "./db";
import {
  getClientIp,
  getIpFamily,
  normalizeIp,
  parseIpv4ToBigInt,
  parseIpv6ToBigInt,
} from "./ip";

export { getClientIp } from "./ip";

//  In-memory rate limiting
// Structure: Map<keyId, { count: number; resetAt: number }>
const rateLimitStore = new Map<number, { count: number; resetAt: number }>();

function checkRateLimit(key: ApiKey): boolean {
  if (!key.rate_limit || key.rate_limit <= 0) return true;

  const now = Date.now();
  const windowMs = 60 * 1000; // 1-minute sliding window

  const entry = rateLimitStore.get(key.id);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key.id, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Increment before checking so read+write happen in one step, preventing
  // bursts past the limit if the app moves to a worker-thread model.
  entry.count += 1;
  return entry.count <= key.rate_limit;
}

function ipToBigInt(ip: string): { family: 4 | 6; value: bigint } | null {
  const family = getIpFamily(ip);
  if (family === 4) {
    const value = parseIpv4ToBigInt(ip);
    return value === null ? null : { family: 4, value };
  }

  if (family === 6) {
    const value = parseIpv6ToBigInt(ip);
    return value === null ? null : { family: 6, value };
  }

  return null;
}

function matchesCidr(ip: string, entry: string): boolean {
  const [rangeIp, prefixText] = entry.split("/");
  const normalizedRangeIp = normalizeIp(rangeIp);
  if (!normalizedRangeIp || !prefixText || !/^\d+$/.test(prefixText)) {
    return false;
  }

  const ipValue = ipToBigInt(ip);
  const rangeValue = ipToBigInt(normalizedRangeIp);
  if (!ipValue || !rangeValue || ipValue.family !== rangeValue.family) {
    return false;
  }

  const totalBits = ipValue.family === 4 ? 32 : 128;
  const prefixLength = Number.parseInt(prefixText, 10);
  if (prefixLength < 0 || prefixLength > totalBits) {
    return false;
  }

  if (prefixLength === 0) {
    return true;
  }

  const shift = BigInt(totalBits - prefixLength);
  return (ipValue.value >> shift) === (rangeValue.value >> shift);
}

function checkIpAllowed(key: ApiKey, ip: string): boolean {
  if (!key.allowed_ips) return true;
  if (ip === "unknown") return false;

  const allowedEntries = key.allowed_ips
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return allowedEntries.some((entry) => {
    if (entry.includes("/")) {
      return matchesCidr(ip, entry);
    }

    return normalizeIp(entry) === ip;
  });
}

//  Main auth function

export interface AuthResult {
  success: boolean;
  apiKey?: ApiKey;
  error?: string;
  status?: number;
}

function isExpired(apiKey: ApiKey): boolean {
  return !!apiKey.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now();
}

export async function validateApiKey(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      success: false,
      error:
        "Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY",
      status: 401,
    };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return { success: false, error: "API key is empty", status: 401 };
  }

  const apiKey = await getApiKey(rawKey);
  if (!apiKey) {
    return { success: false, error: "Invalid or revoked API key", status: 401 };
  }

  if (isExpired(apiKey)) {
    return { success: false, error: "API key has expired", status: 401 };
  }

  const ip = getClientIp(req);
  if (!checkIpAllowed(apiKey, ip)) {
    return {
      success: false,
      error: `IP address ${ip} is not allowed for this API key`,
      status: 403,
    };
  }

  if (!checkRateLimit(apiKey)) {
    return {
      success: false,
      error: `Rate limit exceeded. Max ${apiKey.rate_limit} requests/minute`,
      status: 429,
    };
  }

  await touchApiKey(apiKey.id);
  return { success: true, apiKey };
}
