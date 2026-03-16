"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const server_1 = require("next/server");
const csrf_1 = require("../lib/csrf");
function createRequest(input) {
    return new server_1.NextRequest(input?.url ?? "http://localhost/api/settings", {
        method: input?.method ?? "POST",
        headers: new Headers(input?.headers),
    });
}
(0, node_test_1.default)("checkCsrfProtection allows safe methods without origin checks", () => {
    const request = createRequest({
        method: "GET",
        headers: { origin: "https://evil.example" },
    });
    strict_1.default.equal((0, csrf_1.checkCsrfProtection)(request), null);
});
(0, node_test_1.default)("checkCsrfProtection accepts matching Origin headers", () => {
    const request = createRequest({
        headers: { origin: "http://localhost" },
    });
    strict_1.default.equal((0, csrf_1.checkCsrfProtection)(request), null);
});
(0, node_test_1.default)("checkCsrfProtection accepts matching Referer headers", () => {
    const request = createRequest({
        headers: { referer: "http://localhost/dashboard/settings" },
    });
    strict_1.default.equal((0, csrf_1.checkCsrfProtection)(request), null);
});
(0, node_test_1.default)("checkCsrfProtection accepts same-origin fetch metadata when Origin is absent", () => {
    const request = createRequest({
        headers: { "sec-fetch-site": "same-origin" },
    });
    strict_1.default.equal((0, csrf_1.checkCsrfProtection)(request), null);
});
(0, node_test_1.default)("checkCsrfProtection rejects cross-site origins", async () => {
    const request = createRequest({
        headers: { origin: "https://evil.example" },
    });
    const blocked = (0, csrf_1.checkCsrfProtection)(request);
    strict_1.default.ok(blocked);
    strict_1.default.equal(blocked.status, 403);
    strict_1.default.deepEqual(await blocked.json(), {
        error: "CSRF check failed: request origin does not match this server",
    });
});
(0, node_test_1.default)("checkCsrfProtection rejects requests without same-origin metadata", async () => {
    const request = createRequest();
    const blocked = (0, csrf_1.checkCsrfProtection)(request);
    strict_1.default.ok(blocked);
    strict_1.default.equal(blocked.status, 403);
    strict_1.default.deepEqual(await blocked.json(), {
        error: "CSRF check failed: missing same-origin request metadata",
    });
});
