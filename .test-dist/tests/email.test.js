"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const email_1 = require("../lib/email");
(0, node_test_1.default)("buildAlertEmail includes service, stack, and parsed metadata", () => {
    const { subject, html } = (0, email_1.buildAlertEmail)({
        level: "error",
        message: "A very long alert message that should be truncated in the subject line once it exceeds sixty characters",
        service: null,
        stack: "Error: boom\n    at runTask (/srv/app.js:12:3)",
        metadata: JSON.stringify({ requestId: "req_123", tenantId: "tenant_456" }),
        created_at: "2026-03-16T11:00:00.000Z",
    });
    strict_1.default.match(subject, /^\[ZinaLog\] ERROR: A very long alert message/);
    strict_1.default.match(subject, /…$/);
    strict_1.default.match(html, /unknown service/);
    strict_1.default.match(html, /Error: boom/);
    strict_1.default.match(html, /"requestId": "req_123"/);
    strict_1.default.match(html, /2026-03-16T11:00:00.000Z UTC/);
});
(0, node_test_1.default)("buildAlertEmail skips metadata blocks when metadata is not valid JSON", () => {
    const { html } = (0, email_1.buildAlertEmail)({
        level: "warning",
        message: "Retry queue is backing up",
        service: "worker",
        stack: null,
        metadata: "{not-valid-json",
        created_at: "2026-03-16T11:00:00.000Z",
    });
    strict_1.default.doesNotMatch(html, /Metadata/);
    strict_1.default.doesNotMatch(html, /<pre style="margin:0;background:#0d1117.*Retry queue/s);
});
(0, node_test_1.default)("buildUserInviteEmail includes login credentials and destination URL", () => {
    const { subject, html } = (0, email_1.buildUserInviteEmail)({
        username: "alice",
        temporaryPassword: "TempPass123!",
        expiresAt: "2026-03-16T11:10:00.000Z",
        loginUrl: "https://logs.example.com/login",
    });
    strict_1.default.equal(subject, "[ZinaLog] Your dashboard account is ready");
    strict_1.default.match(html, /alice/);
    strict_1.default.match(html, /TempPass123!/);
    strict_1.default.match(html, /https:\/\/logs\.example\.com\/login/);
    strict_1.default.match(html, /temporary password expires at/i);
});
(0, node_test_1.default)("buildMfaEmail includes the verification code and expiry notice", () => {
    const { subject, html } = (0, email_1.buildMfaEmail)({
        username: "bob",
        code: "482901",
        expiresAt: "2026-03-16T11:15:00.000Z",
    });
    strict_1.default.equal(subject, "[ZinaLog] Your verification code");
    strict_1.default.match(html, /482901/);
    strict_1.default.match(html, /finish signing in to ZinaLog/i);
    strict_1.default.match(html, /This code expires at/i);
});
