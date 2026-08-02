import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlertEmail,
  buildMfaEmail,
  buildUserInviteEmail,
} from "../lib/email";

test("buildAlertEmail includes service, stack, and parsed metadata", () => {
  const { subject, html } = buildAlertEmail({
    level: "error",
    message:
      "A very long alert message that should be truncated in the subject line once it exceeds sixty characters",
    service: null,
    stack: "Error: boom\n    at runTask (/srv/app.js:12:3)",
    metadata: JSON.stringify({ requestId: "req_123", tenantId: "tenant_456" }),
    created_at: "2026-03-16T11:00:00.000Z",
  });

  assert.match(subject, /^\[ZinaLog\] ERROR: A very long alert message/);
  assert.match(subject, /…$/);
  assert.match(html, /unknown service/);
  assert.match(html, /Error: boom/);
  assert.match(html, /&quot;requestId&quot;: &quot;req_123&quot;/);
  assert.match(html, /2026-03-16T11:00:00.000Z UTC/);
});

test("buildAlertEmail escapes HTML in attacker-controlled log fields", () => {
  const { html } = buildAlertEmail({
    level: "error",
    message: "<img src=x onerror=alert(1)>",
    service: "<script>alert('svc')</script>",
    stack: "</pre><script>alert('stack')</script>",
    metadata: JSON.stringify({ note: "</pre><script>alert('meta')</script>" }),
    created_at: "2026-03-16T11:00:00.000Z",
  });

  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(html, /<script>alert\('svc'\)<\/script>/);
  assert.doesNotMatch(html, /<script>alert\('stack'\)<\/script>/);
  assert.doesNotMatch(html, /<script>alert\('meta'\)<\/script>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&#39;svc&#39;\)&lt;\/script&gt;/);
});

test("buildAlertEmail skips metadata blocks when metadata is not valid JSON", () => {
  const { html } = buildAlertEmail({
    level: "warning",
    message: "Retry queue is backing up",
    service: "worker",
    stack: null,
    metadata: "{not-valid-json",
    created_at: "2026-03-16T11:00:00.000Z",
  });

  assert.doesNotMatch(html, /Metadata/);
  assert.doesNotMatch(
    html,
    /<pre style="margin:0;background:#0d1117.*Retry queue/s
  );
});

test("buildAlertEmail falls back for unknown levels without truncating short subjects", () => {
  const { subject, html } = buildAlertEmail({
    level: "fatal",
    message: "Short message",
    service: "billing",
    stack: null,
    metadata: null,
    created_at: "2026-03-16T11:00:00.000Z",
  });

  assert.equal(subject, "[ZinaLog] FATAL: Short message");
  assert.match(html, /billing/);
  assert.match(html, /background:#8b949e22/);
});

test("buildUserInviteEmail includes login credentials and destination URL", () => {
  const { subject, html } = buildUserInviteEmail({
    username: "alice",
    temporaryPassword: "TempPass123!",
    expiresAt: "2026-03-16T11:10:00.000Z",
    loginUrl: "https://logs.example.com/login",
  });

  assert.equal(subject, "[ZinaLog] Your dashboard account is ready");
  assert.match(html, /alice/);
  assert.match(html, /TempPass123!/);
  assert.match(html, /https:\/\/logs\.example\.com\/login/);
  assert.match(html, /temporary password expires at/i);
});

test("buildMfaEmail includes the verification code and expiry notice", () => {
  const { subject, html } = buildMfaEmail({
    username: "bob",
    code: "482901",
    expiresAt: "2026-03-16T11:15:00.000Z",
  });

  assert.equal(subject, "[ZinaLog] Your verification code");
  assert.match(html, /482901/);
  assert.match(html, /finish signing in to ZinaLog/i);
  assert.match(html, /This code expires at/i);
});
