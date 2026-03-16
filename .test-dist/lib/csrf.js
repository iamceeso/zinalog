"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCsrfProtection = checkCsrfProtection;
const server_1 = require("next/server");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
function matchesRequestOrigin(candidate, requestOrigin) {
    try {
        return new URL(candidate).origin === requestOrigin;
    }
    catch {
        return false;
    }
}
function checkCsrfProtection(req) {
    if (SAFE_METHODS.has(req.method)) {
        return null;
    }
    const requestOrigin = req.nextUrl.origin;
    const origin = req.headers.get("origin");
    if (origin) {
        if (matchesRequestOrigin(origin, requestOrigin)) {
            return null;
        }
        return server_1.NextResponse.json({ error: "CSRF check failed: request origin does not match this server" }, { status: 403 });
    }
    const referer = req.headers.get("referer");
    if (referer) {
        if (matchesRequestOrigin(referer, requestOrigin)) {
            return null;
        }
        return server_1.NextResponse.json({ error: "CSRF check failed: request origin does not match this server" }, { status: 403 });
    }
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite === "same-origin" || fetchSite === "same-site") {
        return null;
    }
    return server_1.NextResponse.json({ error: "CSRF check failed: missing same-origin request metadata" }, { status: 403 });
}
