import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import type { ApiKey } from "../lib/db";

type AuthModule = typeof import("../lib/auth");

const compiledAuthModulePath = path.resolve(__dirname, "../lib/auth.js");
const compiledIpModulePath = path.resolve(__dirname, "../lib/ip.js");

declare global {
  var __zinalogAuthTestMocks:
    | Record<
        string,
        {
          getApiKey: (rawKey: string) => Promise<ApiKey | null>;
          touchApiKey: (id: number) => Promise<void>;
        }
      >
    | undefined;
}

function createApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 1,
    name: "test-key",
    key_lookup: "lookup",
    key_hash: "hash",
    service: null,
    allowed_ips: null,
    rate_limit: 1000,
    is_active: 1,
    created_at: new Date(0).toISOString(),
    expires_at: null,
    last_used_at: null,
    usage_count: 0,
    ...overrides,
  };
}

function createRequest(input?: {
  headers?: Record<string, string>;
  ip?: string | null;
}): NextRequest {
  const request = new NextRequest("http://localhost/api/logs", {
    headers: new Headers(input?.headers),
  });

  if (input && "ip" in input) {
    Object.defineProperty(request, "ip", {
      configurable: true,
      value: input.ip,
    });
  }

  return request;
}

async function loadAuthModule(options?: {
  trustProxy?: boolean;
  getApiKey?: (rawKey: string) => Promise<ApiKey | null>;
  touchApiKey?: (id: number) => Promise<void>;
}) {
  const runtimeRoot = path.resolve(__dirname, "../.module-cache");
  await fs.mkdir(runtimeRoot, { recursive: true });
  const runtimeDir = await fs.mkdtemp(path.join(runtimeRoot, "auth-runtime-"));

  await fs.copyFile(compiledAuthModulePath, path.join(runtimeDir, "auth.js"));
  await fs.copyFile(compiledIpModulePath, path.join(runtimeDir, "ip.js"));

  const mockId = `auth-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  globalThis.__zinalogAuthTestMocks ??= {};
  globalThis.__zinalogAuthTestMocks[mockId] = {
    getApiKey: options?.getApiKey ?? (async () => null),
    touchApiKey: options?.touchApiKey ?? (async () => undefined),
  };

  await fs.writeFile(
    path.join(runtimeDir, "db.js"),
    `const mocks = globalThis.__zinalogAuthTestMocks[${JSON.stringify(mockId)}];
exports.getApiKey = (...args) => mocks.getApiKey(...args);
exports.touchApiKey = (...args) => mocks.touchApiKey(...args);
`
  );

  const previousTrustProxy = process.env.TRUST_PROXY;
  if (options?.trustProxy) {
    process.env.TRUST_PROXY = "true";
  } else {
    delete process.env.TRUST_PROXY;
  }

  const authModule = (await import(path.join(runtimeDir, "auth.js"))) as AuthModule;

  return {
    runtimeDir,
    mockId,
    authModule,
    previousTrustProxy,
  };
}

async function closeAuthModule(
  runtimeDir: string,
  mockId: string,
  previousTrustProxy: string | undefined
) {
  if (previousTrustProxy === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = previousTrustProxy;
  }

  if (globalThis.__zinalogAuthTestMocks) {
    delete globalThis.__zinalogAuthTestMocks[mockId];
  }

  await fs.rm(runtimeDir, { recursive: true, force: true });
}

test("getClientIp normalizes direct request IP values", async (t) => {
  const { runtimeDir, mockId, authModule, previousTrustProxy } = await loadAuthModule();
  t.after(async () => closeAuthModule(runtimeDir, mockId, previousTrustProxy));

  assert.equal(authModule.getClientIp(createRequest({ ip: "::ffff:192.0.2.10" })), "192.0.2.10");
  assert.equal(authModule.getClientIp(createRequest({ ip: "fe80::1%eth0" })), "fe80::1");
  assert.equal(authModule.getClientIp(createRequest({ ip: "[2001:db8::1]" })), "2001:db8::1");
});

test("getClientIp trusts forwarded headers only when TRUST_PROXY is enabled", async (t) => {
  const direct = await loadAuthModule({ trustProxy: false });
  t.after(async () => closeAuthModule(direct.runtimeDir, direct.mockId, direct.previousTrustProxy));

  const forwardedRequest = createRequest({
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    ip: "192.0.2.2",
  });
  assert.equal(direct.authModule.getClientIp(forwardedRequest), "192.0.2.2");

  const proxied = await loadAuthModule({ trustProxy: true });
  t.after(async () => closeAuthModule(proxied.runtimeDir, proxied.mockId, proxied.previousTrustProxy));

  assert.equal(proxied.authModule.getClientIp(forwardedRequest), "203.0.113.9");
  assert.equal(
    proxied.authModule.getClientIp(
      createRequest({
        headers: { "x-real-ip": "::ffff:198.51.100.8" },
        ip: "192.0.2.2",
      })
    ),
    "198.51.100.8"
  );
});

test("validateApiKey rejects missing, expired, and disallowed requests", async (t) => {
  const expiredKey = createApiKey({
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  const allowedKey = createApiKey({
    allowed_ips: "192.168.1.0/24,2001:db8::/32",
  });

  const { runtimeDir, mockId, authModule, previousTrustProxy } = await loadAuthModule({
    getApiKey: async (rawKey) => {
      if (rawKey === "expired-key") return expiredKey;
      if (rawKey === "allowed-key") return allowedKey;
      return null;
    },
  });
  t.after(async () => closeAuthModule(runtimeDir, mockId, previousTrustProxy));

  const missing = await authModule.validateApiKey(createRequest());
  assert.deepEqual(missing, {
    success: false,
    error: "Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY",
    status: 401,
  });

  const expired = await authModule.validateApiKey(
    createRequest({
      headers: { authorization: "Bearer expired-key" },
      ip: "192.168.1.12",
    })
  );
  assert.deepEqual(expired, {
    success: false,
    error: "API key has expired",
    status: 401,
  });

  const disallowed = await authModule.validateApiKey(
    createRequest({
      headers: { authorization: "Bearer allowed-key" },
      ip: "10.0.0.50",
    })
  );
  assert.deepEqual(disallowed, {
    success: false,
    error: "IP address 10.0.0.50 is not allowed for this API key",
    status: 403,
  });

  const allowed = await authModule.validateApiKey(
    createRequest({
      headers: { authorization: "Bearer allowed-key" },
      ip: "2001:db8::42",
    })
  );
  assert.equal(allowed.success, true);
  assert.equal(allowed.apiKey?.id, allowedKey.id);
});

test("validateApiKey increments usage only for requests within the rate limit", async (t) => {
  const touchedKeyIds: number[] = [];
  const rateLimitedKey = createApiKey({
    id: 42,
    rate_limit: 2,
  });

  const { runtimeDir, mockId, authModule, previousTrustProxy } = await loadAuthModule({
    getApiKey: async (rawKey) => (rawKey === "burst-key" ? rateLimitedKey : null),
    touchApiKey: async (id) => {
      touchedKeyIds.push(id);
    },
  });
  t.after(async () => closeAuthModule(runtimeDir, mockId, previousTrustProxy));

  const request = () =>
    authModule.validateApiKey(
      createRequest({
        headers: { authorization: "Bearer burst-key" },
        ip: "198.51.100.12",
      })
    );

  assert.equal((await request()).success, true);
  assert.equal((await request()).success, true);

  const blocked = await request();
  assert.deepEqual(blocked, {
    success: false,
    error: "Rate limit exceeded. Max 2 requests/minute",
    status: 429,
  });

  assert.deepEqual(touchedKeyIds, [42, 42]);
});
