"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const server_1 = require("next/server");
const compiledAuthModulePath = node_path_1.default.resolve(__dirname, "../lib/auth.js");
const compiledIpModulePath = node_path_1.default.resolve(__dirname, "../lib/ip.js");
function createApiKey(overrides = {}) {
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
function createRequest(input) {
    const request = new server_1.NextRequest("http://localhost/api/logs", {
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
async function loadAuthModule(options) {
    const runtimeRoot = node_path_1.default.resolve(__dirname, "../.module-cache");
    await promises_1.default.mkdir(runtimeRoot, { recursive: true });
    const runtimeDir = await promises_1.default.mkdtemp(node_path_1.default.join(runtimeRoot, "auth-runtime-"));
    await promises_1.default.copyFile(compiledAuthModulePath, node_path_1.default.join(runtimeDir, "auth.js"));
    await promises_1.default.copyFile(compiledIpModulePath, node_path_1.default.join(runtimeDir, "ip.js"));
    const mockId = `auth-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    globalThis.__zinalogAuthTestMocks ?? (globalThis.__zinalogAuthTestMocks = {});
    globalThis.__zinalogAuthTestMocks[mockId] = {
        getApiKey: options?.getApiKey ?? (async () => null),
        touchApiKey: options?.touchApiKey ?? (async () => undefined),
    };
    await promises_1.default.writeFile(node_path_1.default.join(runtimeDir, "db.js"), `const mocks = globalThis.__zinalogAuthTestMocks[${JSON.stringify(mockId)}];
exports.getApiKey = (...args) => mocks.getApiKey(...args);
exports.touchApiKey = (...args) => mocks.touchApiKey(...args);
`);
    const previousTrustProxy = process.env.TRUST_PROXY;
    if (options?.trustProxy) {
        process.env.TRUST_PROXY = "true";
    }
    else {
        delete process.env.TRUST_PROXY;
    }
    const authModule = (await Promise.resolve(`${node_path_1.default.join(runtimeDir, "auth.js")}`).then(s => __importStar(require(s))));
    return {
        runtimeDir,
        mockId,
        authModule,
        previousTrustProxy,
    };
}
async function closeAuthModule(runtimeDir, mockId, previousTrustProxy) {
    if (previousTrustProxy === undefined) {
        delete process.env.TRUST_PROXY;
    }
    else {
        process.env.TRUST_PROXY = previousTrustProxy;
    }
    if (globalThis.__zinalogAuthTestMocks) {
        delete globalThis.__zinalogAuthTestMocks[mockId];
    }
    await promises_1.default.rm(runtimeDir, { recursive: true, force: true });
}
(0, node_test_1.default)("getClientIp normalizes direct request IP values", async (t) => {
    const { runtimeDir, mockId, authModule, previousTrustProxy } = await loadAuthModule();
    t.after(async () => closeAuthModule(runtimeDir, mockId, previousTrustProxy));
    strict_1.default.equal(authModule.getClientIp(createRequest({ ip: "::ffff:192.0.2.10" })), "192.0.2.10");
    strict_1.default.equal(authModule.getClientIp(createRequest({ ip: "fe80::1%eth0" })), "fe80::1");
    strict_1.default.equal(authModule.getClientIp(createRequest({ ip: "[2001:db8::1]" })), "2001:db8::1");
});
(0, node_test_1.default)("getClientIp trusts forwarded headers only when TRUST_PROXY is enabled", async (t) => {
    const direct = await loadAuthModule({ trustProxy: false });
    t.after(async () => closeAuthModule(direct.runtimeDir, direct.mockId, direct.previousTrustProxy));
    const forwardedRequest = createRequest({
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
        ip: "192.0.2.2",
    });
    strict_1.default.equal(direct.authModule.getClientIp(forwardedRequest), "192.0.2.2");
    const proxied = await loadAuthModule({ trustProxy: true });
    t.after(async () => closeAuthModule(proxied.runtimeDir, proxied.mockId, proxied.previousTrustProxy));
    strict_1.default.equal(proxied.authModule.getClientIp(forwardedRequest), "203.0.113.9");
    strict_1.default.equal(proxied.authModule.getClientIp(createRequest({
        headers: { "x-real-ip": "::ffff:198.51.100.8" },
        ip: "192.0.2.2",
    })), "198.51.100.8");
});
(0, node_test_1.default)("validateApiKey rejects missing, expired, and disallowed requests", async (t) => {
    const expiredKey = createApiKey({
        expires_at: new Date(Date.now() - 60000).toISOString(),
    });
    const allowedKey = createApiKey({
        allowed_ips: "192.168.1.0/24,2001:db8::/32",
    });
    const { runtimeDir, mockId, authModule, previousTrustProxy } = await loadAuthModule({
        getApiKey: async (rawKey) => {
            if (rawKey === "expired-key")
                return expiredKey;
            if (rawKey === "allowed-key")
                return allowedKey;
            return null;
        },
    });
    t.after(async () => closeAuthModule(runtimeDir, mockId, previousTrustProxy));
    const missing = await authModule.validateApiKey(createRequest());
    strict_1.default.deepEqual(missing, {
        success: false,
        error: "Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY",
        status: 401,
    });
    const expired = await authModule.validateApiKey(createRequest({
        headers: { authorization: "Bearer expired-key" },
        ip: "192.168.1.12",
    }));
    strict_1.default.deepEqual(expired, {
        success: false,
        error: "API key has expired",
        status: 401,
    });
    const disallowed = await authModule.validateApiKey(createRequest({
        headers: { authorization: "Bearer allowed-key" },
        ip: "10.0.0.50",
    }));
    strict_1.default.deepEqual(disallowed, {
        success: false,
        error: "IP address 10.0.0.50 is not allowed for this API key",
        status: 403,
    });
    const allowed = await authModule.validateApiKey(createRequest({
        headers: { authorization: "Bearer allowed-key" },
        ip: "2001:db8::42",
    }));
    strict_1.default.equal(allowed.success, true);
    strict_1.default.equal(allowed.apiKey?.id, allowedKey.id);
});
(0, node_test_1.default)("validateApiKey increments usage only for requests within the rate limit", async (t) => {
    const touchedKeyIds = [];
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
    const request = () => authModule.validateApiKey(createRequest({
        headers: { authorization: "Bearer burst-key" },
        ip: "198.51.100.12",
    }));
    strict_1.default.equal((await request()).success, true);
    strict_1.default.equal((await request()).success, true);
    const blocked = await request();
    strict_1.default.deepEqual(blocked, {
        success: false,
        error: "Rate limit exceeded. Max 2 requests/minute",
        status: 429,
    });
    strict_1.default.deepEqual(touchedKeyIds, [42, 42]);
});
