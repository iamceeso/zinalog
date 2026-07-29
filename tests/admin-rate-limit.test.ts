import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type AdminRateLimitModule = typeof import("../lib/admin-rate-limit");

const compiledModulePath = path.resolve(
  __dirname,
  "../lib/admin-rate-limit.js"
);
const compiledIpModulePath = path.resolve(__dirname, "../lib/ip.js");
const cjsRequire = createRequire(import.meta.url);

declare global {
  var __zinalogAdminRateLimitTestMocks:
    | Record<string, { getClientIp: (request: NextRequest) => string }>
    | undefined;
}

function createRequest(input?: {
  headers?: Record<string, string>;
  ip?: string | null;
}): NextRequest {
  const request = new NextRequest("http://localhost/api/settings", {
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

async function loadAdminRateLimitModule(options?: {
  getClientIp?: (request: NextRequest) => string;
}) {
  const mockId = `admin-rate-limit-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  globalThis.__zinalogAdminRateLimitTestMocks ??= {};
  globalThis.__zinalogAdminRateLimitTestMocks[mockId] = {
    getClientIp: options?.getClientIp ?? (() => "unknown"),
  };
  const previousIpCache = cjsRequire.cache[compiledIpModulePath];
  const previousModuleCache = cjsRequire.cache[compiledModulePath];
  cjsRequire.cache[compiledIpModulePath] = {
    id: compiledIpModulePath,
    filename: compiledIpModulePath,
    loaded: true,
    exports: {
      getClientIp: (...args: [NextRequest]) =>
        globalThis.__zinalogAdminRateLimitTestMocks?.[mockId]?.getClientIp(
          ...args
        ),
    },
    children: [],
    paths: [],
    isPreloading: false,
    parent: module,
    path: path.dirname(compiledIpModulePath),
    require: cjsRequire,
  } as NodeModule;
  delete cjsRequire.cache[compiledModulePath];

  return {
    mockId,
    previousIpCache,
    previousModuleCache,
    adminRateLimitModule: cjsRequire(
      compiledModulePath
    ) as AdminRateLimitModule,
  };
}

async function closeAdminRateLimitModule(
  mockId: string,
  previousIpCache: NodeModule | undefined,
  previousModuleCache: NodeModule | undefined
) {
  if (globalThis.__zinalogAdminRateLimitTestMocks) {
    delete globalThis.__zinalogAdminRateLimitTestMocks[mockId];
  }
  delete cjsRequire.cache[compiledModulePath];
  if (previousModuleCache) {
    cjsRequire.cache[compiledModulePath] = previousModuleCache;
  }
  if (previousIpCache) {
    cjsRequire.cache[compiledIpModulePath] = previousIpCache;
  } else {
    delete cjsRequire.cache[compiledIpModulePath];
  }
}

test("checkAdminRateLimit blocks the 31st request in a one-minute window", async (t) => {
  const { mockId, previousIpCache, previousModuleCache, adminRateLimitModule } =
    await loadAdminRateLimitModule({
      getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
  t.after(async () =>
    closeAdminRateLimitModule(mockId, previousIpCache, previousModuleCache)
  );

  const restoreNow = Date.now;
  Date.now = () => 1_000;
  t.after(() => {
    Date.now = restoreNow;
  });

  const request = createRequest({ headers: { "x-test-ip": "203.0.113.10" } });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal(adminRateLimitModule.checkAdminRateLimit(request), null);
  }

  const blocked = adminRateLimitModule.checkAdminRateLimit(request);
  assert.ok(blocked);
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), {
    error: "Too many requests. Max 30 admin requests/minute per IP.",
  });
});

test("checkAdminRateLimit resets counters after the time window elapses", async (t) => {
  const { mockId, previousIpCache, previousModuleCache, adminRateLimitModule } =
    await loadAdminRateLimitModule({
      getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
  t.after(async () =>
    closeAdminRateLimitModule(mockId, previousIpCache, previousModuleCache)
  );

  const restoreNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = restoreNow;
  });

  const request = createRequest({ headers: { "x-test-ip": "198.51.100.7" } });

  for (let attempt = 0; attempt < 31; attempt += 1) {
    adminRateLimitModule.checkAdminRateLimit(request);
  }

  now += 60_001;
  assert.equal(adminRateLimitModule.checkAdminRateLimit(request), null);
});

test("checkAdminRateLimit tracks different IPs independently", async (t) => {
  const { mockId, previousIpCache, previousModuleCache, adminRateLimitModule } =
    await loadAdminRateLimitModule({
      getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
  t.after(async () =>
    closeAdminRateLimitModule(mockId, previousIpCache, previousModuleCache)
  );

  const restoreNow = Date.now;
  Date.now = () => 25_000;
  t.after(() => {
    Date.now = restoreNow;
  });

  const primaryIpRequest = createRequest({
    headers: { "x-test-ip": "192.0.2.50" },
  });
  const secondaryIpRequest = createRequest({
    headers: { "x-test-ip": "192.0.2.51" },
  });

  for (let attempt = 0; attempt < 31; attempt += 1) {
    adminRateLimitModule.checkAdminRateLimit(primaryIpRequest);
  }

  assert.equal(
    adminRateLimitModule.checkAdminRateLimit(secondaryIpRequest),
    null
  );
});

test("checkAdminRateLimit uses getClientIp output when grouping requests", async (t) => {
  const { mockId, previousIpCache, previousModuleCache, adminRateLimitModule } =
    await loadAdminRateLimitModule({
      getClientIp: (request) => {
        if (request.headers.get("x-forwarded-for")) {
          return "198.51.100.44";
        }

        return request.headers.get("x-test-ip") ?? "unknown";
      },
    });
  t.after(async () =>
    closeAdminRateLimitModule(mockId, previousIpCache, previousModuleCache)
  );

  const restoreNow = Date.now;
  Date.now = () => 50_000;
  t.after(() => {
    Date.now = restoreNow;
  });

  const proxiedRequest = createRequest({
    headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
  });
  const directRequest = createRequest({
    headers: { "x-test-ip": "198.51.100.44" },
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    adminRateLimitModule.checkAdminRateLimit(proxiedRequest);
  }

  const blocked = adminRateLimitModule.checkAdminRateLimit(directRequest);
  assert.ok(blocked);
  assert.equal(blocked.status, 429);
});
