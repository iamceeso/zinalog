"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAdminRateLimit = checkAdminRateLimit;
const server_1 = require("next/server");
const ip_1 = require("./ip");
// Simple in-memory IP-based rate limiter for admin mutation endpoints.
// Limits each IP to LIMIT requests per WINDOW_MS (default: 30 req/min).
// This runs on the Node.js main thread alongside sqlite/sqlite3 intentionally
// synchronous so it never yields between check and increment.
const WINDOW_MS = 60 * 1000;
const LIMIT = 30;
const store = new Map();
/**
 * Returns a 429 Response if the IP has exceeded the admin rate limit,
 * or null if the request is allowed.
 */
function checkAdminRateLimit(req) {
    const ip = (0, ip_1.getClientIp)(req);
    const now = Date.now();
    const entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return null;
    }
    entry.count += 1;
    if (entry.count > LIMIT) {
        return server_1.NextResponse.json({ error: `Too many requests. Max ${LIMIT} admin requests/minute per IP.` }, { status: 429 });
    }
    return null;
}
