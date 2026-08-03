import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import type { ApiKey } from "../lib/db";

type AuthModule = typeof import("../lib/auth");

const compiledAuthModulePath = path.resolve(__dirname, "../lib/auth.js");
const compiledIpModulePath = path.resolve(__dirname, "../lib/ip.js");
const cjsRequire = createRequire(__filename);

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

function createRequest(input?: { headers?: Record<string, string> }): NextRequest {
  return new NextRequest("http://localhost/api/logs", {
    headers: new Headers(input?.headers),
  });
}

async function loadAuthModule(options?: {
  trustProxy?: boolean;
  getApiKey?: (rawKey: string) => Promise<ApiKey | null>;
  touchApiKey?: (id: number) => Promise<void>;
}) {
  const mockId = `auth-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  globalThis.__zinalogAuthTestMocks ??= {};
  globalThis.__zinalogAuthTestMocks[mockId] = {
    getApiKey: options?.getApiKey ?? (async () => null),
    touchApiKey: options?.touchApiKey ?? (async () => undefined),
  };
  const compiledDbModulePath = path.resolve(__dirname, "../lib/db.js");
  const previousDbCache = cjsRequire.cache[compiledDbModulePath];
  const previousAuthCache = cjsRequire.cache[compiledAuthModulePath];
  const previousIpCache = cjsRequire.cache[compiledIpModulePath];
  cjsRequire.cache[compiledDbModulePath] = {
    id: compiledDbModulePath,
    filename: compiledDbModulePath,
    loaded: true,
    exports: {
      getApiKey: (...args: [string]) =>
        globalThis.__zinalogAuthTestMocks?.[mockId]?.getApiKey(...args),
      touchApiKey: (...args: [number]) =>
        globalThis.__zinalogAuthTestMocks?.[mockId]?.touchApiKey(...args),
    },
    children: [],
    paths: [],
    isPreloading: false,
    parent: module,
    path: path.dirname(compiledDbModulePath),
    require: cjsRequire,
  } as NodeModule;

  const previousTrustProxy = process.env.TRUST_PROXY;
  if (options?.trustProxy) {
    process.env.TRUST_PROXY = "true";
  } else {
    delete process.env.TRUST_PROXY;
  }

  delete cjsRequire.cache[compiledAuthModulePath];
  delete cjsRequire.cache[compiledIpModulePath];
  const authModule = cjsRequire(compiledAuthModulePath) as AuthModule;

  return {
    mockId,
    authModule,
    previousTrustProxy,
    previousDbCache,
    previousAuthCache,
    previousIpCache,
  };
}

async function closeAuthModule(
  mockId: string,
  previousTrustProxy: string | undefined,
  previousDbCache: NodeModule | undefined,
  previousAuthCache: NodeModule | undefined,
  previousIpCache: NodeModule | undefined
) {
  if (previousTrustProxy === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = previousTrustProxy;
  }

  if (globalThis.__zinalogAuthTestMocks) {
    delete globalThis.__zinalogAuthTestMocks[mockId];
  }
  const compiledDbModulePath = path.resolve(__dirname, "../lib/db.js");
  delete cjsRequire.cache[compiledAuthModulePath];
  if (previousAuthCache) {
    cjsRequire.cache[compiledAuthModulePath] = previousAuthCache;
  }
  if (previousDbCache) {
    cjsRequire.cache[compiledDbModulePath] = previousDbCache;
  } else {
    delete cjsRequire.cache[compiledDbModulePath];
  }
  if (previousIpCache) {
    cjsRequire.cache[compiledIpModulePath] = previousIpCache;
  } else {
    delete cjsRequire.cache[compiledIpModulePath];
  }
}

test("getClientIp normalizes direct request IP values", async (t) => {
  const {
    mockId,
    authModule,
    previousTrustProxy,
    previousDbCache,
    previousAuthCache,
    previousIpCache,
  } = await loadAuthModule();
  t.after(async () =>
    closeAuthModule(
      mockId,
      previousTrustProxy,
      previousDbCache,
      previousAuthCache,
      previousIpCache
    )
  );

  assert.equal(
    authModule.getClientIp(
      createRequest({ headers: { "x-forwarded-for": "::ffff:192.0.2.10" } })
    ),
    "192.0.2.10"
  );
  assert.equal(
    authModule.getClientIp(
      createRequest({ headers: { "x-forwarded-for": "fe80::1%eth0" } })
    ),
    "fe80::1"
  );
  assert.equal(
    authModule.getClientIp(
      createRequest({ headers: { "x-forwarded-for": "[2001:db8::1]" } })
    ),
    "2001:db8::1"
  );
});

test("getClientIp trusts forwarded headers only when TRUST_PROXY is enabled", async (t) => {
  const direct = await loadAuthModule({ trustProxy: false });
  t.after(async () =>
    closeAuthModule(
      direct.mockId,
      direct.previousTrustProxy,
      direct.previousDbCache,
      direct.previousAuthCache,
      direct.previousIpCache
    )
  );

  const forwardedRequest = createRequest({
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  // A multi-hop chain could not have come from Next's own socket-address
  // fallback, and without a declared trusted proxy there's no way to
  // distinguish a real chain from one the client made up itself.
  assert.equal(direct.authModule.getClientIp(forwardedRequest), "unknown");

  // A bare single-value header is what Next.js itself sets from the raw
  // socket's remote address when nothing upstream already set the header,
  // so it's trusted even without a declared proxy.
  assert.equal(
    direct.authModule.getClientIp(
      createRequest({ headers: { "x-forwarded-for": "192.0.2.2" } })
    ),
    "192.0.2.2"
  );

  const proxied = await loadAuthModule({ trustProxy: true });
  t.after(async () =>
    closeAuthModule(
      proxied.mockId,
      proxied.previousTrustProxy,
      proxied.previousDbCache,
      proxied.previousAuthCache,
      proxied.previousIpCache
    )
  );

  assert.equal(proxied.authModule.getClientIp(forwardedRequest), "203.0.113.9");
  assert.equal(
    proxied.authModule.getClientIp(
      createRequest({
        headers: { "x-real-ip": "::ffff:198.51.100.8" },
      })
    ),
    "198.51.100.8"
  );
  assert.equal(
    proxied.authModule.getClientIp(
      createRequest({
        headers: {
          "x-forwarded-for": "not-an-ip",
          "x-real-ip": "203.0.113.55",
        },
      })
    ),
    "203.0.113.55"
  );
  assert.equal(proxied.authModule.getClientIp(createRequest()), "unknown");
});

test("validateApiKey rejects missing, expired, and disallowed requests", async (t) => {
  const expiredKey = createApiKey({
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  const allowedKey = createApiKey({
    allowed_ips: "192.168.1.0/24,2001:db8::/32",
  });
  const exactIpKey = createApiKey({
    id: 2,
    allowed_ips: "198.51.100.25",
  });
  const invalidCidrKey = createApiKey({
    id: 3,
    allowed_ips: "198.51.100.0/not-a-prefix",
  });
  const zeroPrefixKey = createApiKey({
    id: 4,
    allowed_ips: "0.0.0.0/0",
  });

  const {
    mockId,
    authModule,
    previousTrustProxy,
    previousDbCache,
    previousAuthCache,
    previousIpCache,
  } = await loadAuthModule({
    getApiKey: async (rawKey) => {
      if (rawKey === "expired-key") return expiredKey;
      if (rawKey === "allowed-key") return allowedKey;
      if (rawKey === "exact-ip-key") return exactIpKey;
      if (rawKey === "invalid-cidr-key") return invalidCidrKey;
      if (rawKey === "zero-prefix-key") return zeroPrefixKey;
      return null;
    },
  });
  t.after(async () =>
    closeAuthModule(
      mockId,
      previousTrustProxy,
      previousDbCache,
      previousAuthCache,
      previousIpCache
    )
  );

  const missing = await authModule.validateApiKey(createRequest());
  assert.deepEqual(missing, {
    success: false,
    error:
      "Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY",
    status: 401,
  });

  const invalid = await authModule.validateApiKey(
    createRequest({
      headers: { authorization: "Bearer invalid-key" },
    })
  );
  assert.deepEqual(invalid, {
    success: false,
    error: "Invalid or revoked API key",
    status: 401,
  });

  const expired = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer expired-key",
        "x-forwarded-for": "192.168.1.12",
      },
    })
  );
  assert.deepEqual(expired, {
    success: false,
    error: "API key has expired",
    status: 401,
  });

  const disallowed = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer allowed-key",
        "x-forwarded-for": "10.0.0.50",
      },
    })
  );
  assert.deepEqual(disallowed, {
    success: false,
    error: "IP address 10.0.0.50 is not allowed for this API key",
    status: 403,
  });

  const allowed = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer allowed-key",
        "x-forwarded-for": "2001:db8::42",
      },
    })
  );
  assert.equal(allowed.success, true);
  assert.equal(allowed.apiKey?.id, allowedKey.id);

  const exactAllowed = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer exact-ip-key",
        "x-forwarded-for": "198.51.100.25",
      },
    })
  );
  assert.equal(exactAllowed.success, true);

  const invalidCidr = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer invalid-cidr-key",
        "x-forwarded-for": "198.51.100.25",
      },
    })
  );
  assert.deepEqual(invalidCidr, {
    success: false,
    error: "IP address 198.51.100.25 is not allowed for this API key",
    status: 403,
  });

  const zeroPrefixAllowed = await authModule.validateApiKey(
    createRequest({
      headers: {
        authorization: "Bearer zero-prefix-key",
        "x-forwarded-for": "203.0.113.77",
      },
    })
  );
  assert.equal(zeroPrefixAllowed.success, true);

  const unknownBlocked = await authModule.validateApiKey(
    createRequest({
      headers: { authorization: "Bearer allowed-key" },
    })
  );
  assert.deepEqual(unknownBlocked, {
    success: false,
    error: "IP address unknown is not allowed for this API key",
    status: 403,
  });
});

test("validateApiKey increments usage only for requests within the rate limit", async (t) => {
  const touchedKeyIds: number[] = [];
  const rateLimitedKey = createApiKey({
    id: 42,
    rate_limit: 2,
  });

  const {
    mockId,
    authModule,
    previousTrustProxy,
    previousDbCache,
    previousAuthCache,
    previousIpCache,
  } = await loadAuthModule({
    getApiKey: async (rawKey) =>
      rawKey === "burst-key" ? rateLimitedKey : null,
    touchApiKey: async (id) => {
      touchedKeyIds.push(id);
    },
  });
  t.after(async () =>
    closeAuthModule(
      mockId,
      previousTrustProxy,
      previousDbCache,
      previousAuthCache,
      previousIpCache
    )
  );

  const request = () =>
    authModule.validateApiKey(
      createRequest({
        headers: {
          authorization: "Bearer burst-key",
          "x-forwarded-for": "198.51.100.12",
        },
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

test("validateApiKey resets rate limits after the window and skips limiting for non-positive limits", async (t) => {
  const touchedKeyIds: number[] = [];
  const unlimitedKey = createApiKey({
    id: 99,
    rate_limit: 0,
  });
  const singleBurstKey = createApiKey({
    id: 100,
    rate_limit: 1,
  });

  const {
    mockId,
    authModule,
    previousTrustProxy,
    previousDbCache,
    previousAuthCache,
    previousIpCache,
  } = await loadAuthModule({
    getApiKey: async (rawKey) => {
      if (rawKey === "unlimited-key") return unlimitedKey;
      if (rawKey === "single-burst-key") return singleBurstKey;
      return null;
    },
    touchApiKey: async (id) => {
      touchedKeyIds.push(id);
    },
  });
  t.after(async () =>
    closeAuthModule(
      mockId,
      previousTrustProxy,
      previousDbCache,
      previousAuthCache,
      previousIpCache
    )
  );

  const restoreNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = restoreNow;
  });

  const unlimitedRequest = () =>
    authModule.validateApiKey(
      createRequest({
        headers: {
          authorization: "Bearer unlimited-key",
          "x-forwarded-for": "198.51.100.50",
        },
      })
    );

  assert.equal((await unlimitedRequest()).success, true);
  assert.equal((await unlimitedRequest()).success, true);

  const singleBurstRequest = () =>
    authModule.validateApiKey(
      createRequest({
        headers: {
          authorization: "Bearer single-burst-key",
          "x-forwarded-for": "198.51.100.60",
        },
      })
    );

  assert.equal((await singleBurstRequest()).success, true);
  assert.deepEqual(await singleBurstRequest(), {
    success: false,
    error: "Rate limit exceeded. Max 1 requests/minute",
    status: 429,
  });

  now += 60_001;
  assert.equal((await singleBurstRequest()).success, true);
  assert.deepEqual(touchedKeyIds, [99, 99, 100, 100]);
});
