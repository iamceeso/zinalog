"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = void 0;
exports.validateApiKey = validateApiKey;
const db_1 = require("./db");
const ip_1 = require("./ip");
var ip_2 = require("./ip");
Object.defineProperty(exports, "getClientIp", { enumerable: true, get: function () { return ip_2.getClientIp; } });
//  In-memory rate limiting
// Structure: Map<keyId, { count: number; resetAt: number }>
const rateLimitStore = new Map();
function checkRateLimit(key) {
    if (!key.rate_limit || key.rate_limit <= 0)
        return true;
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
function ipToBigInt(ip) {
    const family = (0, ip_1.getIpFamily)(ip);
    if (family === 4) {
        const value = (0, ip_1.parseIpv4ToBigInt)(ip);
        return value === null ? null : { family: 4, value };
    }
    if (family === 6) {
        const value = (0, ip_1.parseIpv6ToBigInt)(ip);
        return value === null ? null : { family: 6, value };
    }
    return null;
}
function matchesCidr(ip, entry) {
    const [rangeIp, prefixText] = entry.split("/");
    const normalizedRangeIp = (0, ip_1.normalizeIp)(rangeIp);
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
function checkIpAllowed(key, ip) {
    if (!key.allowed_ips)
        return true;
    if (ip === "unknown")
        return false;
    const allowedEntries = key.allowed_ips
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    return allowedEntries.some((entry) => {
        if (entry.includes("/")) {
            return matchesCidr(ip, entry);
        }
        return (0, ip_1.normalizeIp)(entry) === ip;
    });
}
function isExpired(apiKey) {
    return !!apiKey.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now();
}
async function validateApiKey(req) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return {
            success: false,
            error: "Missing or invalid Authorization header. Use: Authorization: Bearer YOUR_API_KEY",
            status: 401,
        };
    }
    const rawKey = authHeader.slice(7).trim();
    if (!rawKey) {
        return { success: false, error: "API key is empty", status: 401 };
    }
    const apiKey = await (0, db_1.getApiKey)(rawKey);
    if (!apiKey) {
        return { success: false, error: "Invalid or revoked API key", status: 401 };
    }
    if (isExpired(apiKey)) {
        return { success: false, error: "API key has expired", status: 401 };
    }
    const ip = (0, ip_1.getClientIp)(req);
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
    await (0, db_1.touchApiKey)(apiKey.id);
    return { success: true, apiKey };
}
