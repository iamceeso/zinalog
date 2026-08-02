import assert from "node:assert/strict";
import test from "node:test";
import {
  MASKED_SECRET,
  isMaskedSecret,
  sanitizeMonitorForClient,
} from "../lib/monitor-fields";
import type { Monitor } from "../lib/db";

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: "prod-api",
    type: "http",
    target: "https://example.com/",
    port: null,
    method: "GET",
    headers: null,
    basic_auth_user: null,
    basic_auth_pass: null,
    expected_status: "200-299",
    interval_seconds: 60,
    timeout_seconds: 10,
    retries: 0,
    follow_redirects: 1,
    verify_ssl: 1,
    is_active: 1,
    notify_enabled: 1,
    status: "pending",
    consecutive_fails: 0,
    last_check_at: null,
    last_status_change_at: null,
    ssl_expires_at: null,
    ssl_issuer: null,
    ssl_valid: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

test("isMaskedSecret only matches the exact sentinel value", () => {
  assert.equal(isMaskedSecret(MASKED_SECRET), true);
  assert.equal(isMaskedSecret("some-other-value"), false);
  assert.equal(isMaskedSecret(null), false);
  assert.equal(isMaskedSecret(undefined), false);
});

test("sanitizeMonitorForClient masks a set basic_auth_pass and headers", () => {
  const sanitized = sanitizeMonitorForClient(
    baseMonitor({
      basic_auth_pass: "enc:deadbeef:cafebabe:1234",
      headers: 'enc:aa:bb:{"X-Api-Key":"secret"}',
    })
  );

  assert.equal(sanitized.basic_auth_pass, MASKED_SECRET);
  assert.equal(sanitized.headers, MASKED_SECRET);
  assert.equal(sanitized.name, "prod-api");
  assert.equal(sanitized.id, 1);
});

test("sanitizeMonitorForClient leaves unset basic_auth_pass and headers as null", () => {
  const sanitized = sanitizeMonitorForClient(
    baseMonitor({ basic_auth_pass: null, headers: null })
  );

  assert.equal(sanitized.basic_auth_pass, null);
  assert.equal(sanitized.headers, null);
});

test("sanitizeMonitorForClient preserves extra fields from subtypes", () => {
  interface MonitorWithExtra extends Monitor {
    last_response_time_ms: number | null;
  }

  const monitor: MonitorWithExtra = {
    ...baseMonitor(),
    last_response_time_ms: 42,
  };

  const sanitized = sanitizeMonitorForClient(monitor);
  assert.equal(sanitized.last_response_time_ms, 42);
});
