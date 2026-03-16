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
const compiledModulePath = node_path_1.default.resolve(__dirname, "../lib/admin-rate-limit.js");
function createRequest(input) {
    const request = new server_1.NextRequest("http://localhost/api/settings", {
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
async function loadAdminRateLimitModule(options) {
    const runtimeRoot = node_path_1.default.resolve(__dirname, "../.module-cache");
    await promises_1.default.mkdir(runtimeRoot, { recursive: true });
    const runtimeDir = await promises_1.default.mkdtemp(node_path_1.default.join(runtimeRoot, "admin-rate-limit-"));
    const runtimeModulePath = node_path_1.default.join(runtimeDir, "admin-rate-limit.js");
    await promises_1.default.copyFile(compiledModulePath, runtimeModulePath);
    const mockId = `admin-rate-limit-${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
    globalThis.__zinalogAdminRateLimitTestMocks ?? (globalThis.__zinalogAdminRateLimitTestMocks = {});
    globalThis.__zinalogAdminRateLimitTestMocks[mockId] = {
        getClientIp: options?.getClientIp ?? (() => "unknown"),
    };
    await promises_1.default.writeFile(node_path_1.default.join(runtimeDir, "ip.js"), `const mocks = globalThis.__zinalogAdminRateLimitTestMocks[${JSON.stringify(mockId)}];
exports.getClientIp = (...args) => mocks.getClientIp(...args);
`);
    return {
        runtimeDir,
        mockId,
        adminRateLimitModule: (await Promise.resolve(`${runtimeModulePath}`).then(s => __importStar(require(s)))),
    };
}
async function closeAdminRateLimitModule(runtimeDir, mockId) {
    if (globalThis.__zinalogAdminRateLimitTestMocks) {
        delete globalThis.__zinalogAdminRateLimitTestMocks[mockId];
    }
    await promises_1.default.rm(runtimeDir, { recursive: true, force: true });
}
(0, node_test_1.default)("checkAdminRateLimit blocks the 31st request in a one-minute window", async (t) => {
    const { runtimeDir, mockId, adminRateLimitModule } = await loadAdminRateLimitModule({
        getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
    t.after(async () => closeAdminRateLimitModule(runtimeDir, mockId));
    const restoreNow = Date.now;
    Date.now = () => 1000;
    t.after(() => {
        Date.now = restoreNow;
    });
    const request = createRequest({ headers: { "x-test-ip": "203.0.113.10" } });
    for (let attempt = 0; attempt < 30; attempt += 1) {
        strict_1.default.equal(adminRateLimitModule.checkAdminRateLimit(request), null);
    }
    const blocked = adminRateLimitModule.checkAdminRateLimit(request);
    strict_1.default.ok(blocked);
    strict_1.default.equal(blocked.status, 429);
    strict_1.default.deepEqual(await blocked.json(), {
        error: "Too many requests. Max 30 admin requests/minute per IP.",
    });
});
(0, node_test_1.default)("checkAdminRateLimit resets counters after the time window elapses", async (t) => {
    const { runtimeDir, mockId, adminRateLimitModule } = await loadAdminRateLimitModule({
        getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
    t.after(async () => closeAdminRateLimitModule(runtimeDir, mockId));
    const restoreNow = Date.now;
    let now = 10000;
    Date.now = () => now;
    t.after(() => {
        Date.now = restoreNow;
    });
    const request = createRequest({ headers: { "x-test-ip": "198.51.100.7" } });
    for (let attempt = 0; attempt < 31; attempt += 1) {
        adminRateLimitModule.checkAdminRateLimit(request);
    }
    now += 60001;
    strict_1.default.equal(adminRateLimitModule.checkAdminRateLimit(request), null);
});
(0, node_test_1.default)("checkAdminRateLimit tracks different IPs independently", async (t) => {
    const { runtimeDir, mockId, adminRateLimitModule } = await loadAdminRateLimitModule({
        getClientIp: (request) => request.headers.get("x-test-ip") ?? "unknown",
    });
    t.after(async () => closeAdminRateLimitModule(runtimeDir, mockId));
    const restoreNow = Date.now;
    Date.now = () => 25000;
    t.after(() => {
        Date.now = restoreNow;
    });
    const primaryIpRequest = createRequest({ headers: { "x-test-ip": "192.0.2.50" } });
    const secondaryIpRequest = createRequest({ headers: { "x-test-ip": "192.0.2.51" } });
    for (let attempt = 0; attempt < 31; attempt += 1) {
        adminRateLimitModule.checkAdminRateLimit(primaryIpRequest);
    }
    strict_1.default.equal(adminRateLimitModule.checkAdminRateLimit(secondaryIpRequest), null);
});
(0, node_test_1.default)("checkAdminRateLimit uses getClientIp output when grouping requests", async (t) => {
    const { runtimeDir, mockId, adminRateLimitModule } = await loadAdminRateLimitModule({
        getClientIp: (request) => {
            if (request.headers.get("x-forwarded-for")) {
                return "198.51.100.44";
            }
            return request.headers.get("x-test-ip") ?? "unknown";
        },
    });
    t.after(async () => closeAdminRateLimitModule(runtimeDir, mockId));
    const restoreNow = Date.now;
    Date.now = () => 50000;
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
    strict_1.default.ok(blocked);
    strict_1.default.equal(blocked.status, 429);
});
