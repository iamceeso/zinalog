import assert from "node:assert/strict";
import test from "node:test";
import { validateMonitorPayload } from "../lib/monitor-validation";
import { MASKED_SECRET } from "../lib/monitor-fields";

function baseHttp(overrides: Record<string, unknown> = {}) {
  return {
    name: "prod-api",
    type: "http",
    target: "https://example.com/health",
    ...overrides,
  };
}

function baseTcp(overrides: Record<string, unknown> = {}) {
  return {
    name: "db-port",
    type: "tcp",
    target: "10.0.0.5",
    port: 5432,
    ...overrides,
  };
}

function basePing(overrides: Record<string, unknown> = {}) {
  return {
    name: "gateway",
    type: "ping",
    target: "10.0.0.1",
    ...overrides,
  };
}

test("validateMonitorPayload rejects a missing or overlong name", () => {
  assert.match(
    validateMonitorPayload(baseHttp({ name: "" })).errors[0],
    /name: required/
  );
  assert.match(
    validateMonitorPayload(baseHttp({ name: "   " })).errors[0],
    /name: required/
  );
  assert.match(
    validateMonitorPayload(baseHttp({ name: "a".repeat(101) })).errors[0],
    /name: required/
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ name: "a".repeat(100) })).errors.length,
    0
  );
  assert.match(
    validateMonitorPayload(baseHttp({ name: undefined })).errors[0],
    /name: required/
  );
});

test("validateMonitorPayload rejects a missing or invalid type", () => {
  const missing = validateMonitorPayload(baseHttp({ type: undefined }));
  assert.equal(missing.value, null);
  assert.ok(missing.errors.some((e) => e.startsWith("type:")));

  const invalid = validateMonitorPayload(baseHttp({ type: "carrier-pigeon" }));
  assert.equal(invalid.value, null);
  assert.ok(invalid.errors.some((e) => e.startsWith("type:")));
});

test("validateMonitorPayload validates http target URLs", () => {
  const missing = validateMonitorPayload(baseHttp({ target: undefined }));
  assert.ok(missing.errors.some((e) => e.includes("must be a valid URL")));

  const malformed = validateMonitorPayload(baseHttp({ target: "not a url" }));
  assert.ok(malformed.errors.some((e) => e.includes("must be a valid URL")));

  const wrongProtocol = validateMonitorPayload(
    baseHttp({ target: "ftp://example.com" })
  );
  assert.ok(
    wrongProtocol.errors.some((e) => e.includes("must use http:// or https://"))
  );

  const ok = validateMonitorPayload(
    baseHttp({ target: "https://example.com" })
  );
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.value?.target, "https://example.com/");
});

test("validateMonitorPayload normalizes and validates http method", () => {
  const defaulted = validateMonitorPayload(baseHttp());
  assert.equal(defaulted.value?.method, "GET");

  const lowercase = validateMonitorPayload(baseHttp({ method: "post" }));
  assert.equal(lowercase.value?.method, "POST");

  const invalid = validateMonitorPayload(baseHttp({ method: "TRACE" }));
  assert.ok(invalid.errors.some((e) => e.startsWith("method:")));
});

test("validateMonitorPayload leaves headers untouched when absent from the body", () => {
  const result = validateMonitorPayload(baseHttp());
  assert.equal(result.value?.headers, undefined);
});

test("validateMonitorPayload clears headers on null or empty string", () => {
  assert.equal(
    validateMonitorPayload(baseHttp({ headers: null })).value?.headers,
    null
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ headers: "" })).value?.headers,
    null
  );
});

test("validateMonitorPayload preserves headers when given the masked sentinel", () => {
  const result = validateMonitorPayload(baseHttp({ headers: MASKED_SECRET }));
  assert.equal(result.value?.headers, undefined);
  assert.equal(result.errors.length, 0);
});

test("validateMonitorPayload accepts a valid header object and rejects non-string values", () => {
  const ok = validateMonitorPayload(
    baseHttp({ headers: { "X-Api-Key": "secret" } })
  );
  assert.equal(ok.value?.headers, JSON.stringify({ "X-Api-Key": "secret" }));

  const badValue = validateMonitorPayload(
    baseHttp({ headers: { "X-Count": 5 } })
  );
  assert.ok(
    badValue.errors.some((e) => e.includes("all header values must be strings"))
  );

  const badType = validateMonitorPayload(baseHttp({ headers: 42 }));
  assert.ok(
    badType.errors.some((e) =>
      e.includes("must be an object of header name/value pairs")
    )
  );

  // A plain (non-masked) string isn't a valid header payload either.
  const plainString = validateMonitorPayload(
    baseHttp({ headers: "not-json-and-not-the-mask" })
  );
  assert.ok(
    plainString.errors.some((e) =>
      e.includes("must be an object of header name/value pairs")
    )
  );
});

test("validateMonitorPayload trims basic auth username and defaults to null", () => {
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_user: "  alice  " })).value
      ?.basic_auth_user,
    "alice"
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_user: "   " })).value
      ?.basic_auth_user,
    null
  );
  assert.equal(validateMonitorPayload(baseHttp()).value?.basic_auth_user, null);
});

test("validateMonitorPayload handles basic auth password states", () => {
  assert.equal(
    validateMonitorPayload(baseHttp()).value?.basic_auth_pass,
    undefined
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_pass: null })).value
      ?.basic_auth_pass,
    null
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_pass: "" })).value
      ?.basic_auth_pass,
    null
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_pass: MASKED_SECRET })).value
      ?.basic_auth_pass,
    undefined
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ basic_auth_pass: "s3cret" })).value
      ?.basic_auth_pass,
    "s3cret"
  );

  const badType = validateMonitorPayload(baseHttp({ basic_auth_pass: 12345 }));
  assert.ok(
    badType.errors.some((e) => e.includes("basic_auth_pass: must be a string"))
  );
});

test("validateMonitorPayload defaults and validates expected_status", () => {
  assert.equal(
    validateMonitorPayload(baseHttp()).value?.expected_status,
    "200-299"
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ expected_status: "  " })).value
      ?.expected_status,
    "200-299"
  );
  assert.equal(
    validateMonitorPayload(baseHttp({ expected_status: "200,301-302" })).value
      ?.expected_status,
    "200,301-302"
  );

  const invalid = validateMonitorPayload(
    baseHttp({ expected_status: "not-a-status" })
  );
  assert.ok(invalid.errors.some((e) => e.startsWith("expected_status:")));
});

test("validateMonitorPayload rejects scheme/whitespace and malformed hosts for tcp/ping targets", () => {
  const withScheme = validateMonitorPayload(
    baseTcp({ target: "tcp://10.0.0.5" })
  );
  assert.ok(
    withScheme.errors.some((e) => e.includes("bare hostname or IP address"))
  );

  const withSpace = validateMonitorPayload(baseTcp({ target: "10.0.0.5 5" }));
  assert.ok(
    withSpace.errors.some((e) => e.includes("bare hostname or IP address"))
  );

  const malformedHost = validateMonitorPayload(
    basePing({ target: "!!!bad!!!" })
  );
  assert.ok(
    malformedHost.errors.some((e) => e.includes("bare hostname or IP address"))
  );

  const hostname = validateMonitorPayload(basePing({ target: "example.com" }));
  assert.equal(hostname.errors.length, 0);

  const ipv6 = validateMonitorPayload(basePing({ target: "::1" }));
  assert.equal(ipv6.errors.length, 0);
});

test("validateMonitorPayload clears http-only fields for tcp/ping monitors", () => {
  const result = validateMonitorPayload(
    baseTcp({
      method: "POST",
      headers: { "X-Foo": "bar" },
      basic_auth_user: "alice",
      basic_auth_pass: "s3cret",
    })
  );
  assert.equal(result.value?.method, null);
  assert.equal(result.value?.headers, null);
  assert.equal(result.value?.basic_auth_user, null);
  assert.equal(result.value?.basic_auth_pass, null);
});

test("validateMonitorPayload validates tcp ports", () => {
  const numeric = validateMonitorPayload(baseTcp({ port: 8080 }));
  assert.equal(numeric.value?.port, 8080);

  const stringPort = validateMonitorPayload(baseTcp({ port: "8080" }));
  assert.equal(stringPort.value?.port, 8080);

  const missing = validateMonitorPayload(baseTcp({ port: undefined }));
  assert.ok(missing.errors.some((e) => e.startsWith("port:")));

  const tooLow = validateMonitorPayload(baseTcp({ port: 0 }));
  assert.ok(tooLow.errors.some((e) => e.startsWith("port:")));

  const tooHigh = validateMonitorPayload(baseTcp({ port: 70000 }));
  assert.ok(tooHigh.errors.some((e) => e.startsWith("port:")));

  const nonInteger = validateMonitorPayload(baseTcp({ port: 8080.5 }));
  assert.ok(nonInteger.errors.some((e) => e.startsWith("port:")));
});

test("validateMonitorPayload does not require a port for ping monitors", () => {
  const result = validateMonitorPayload(basePing());
  assert.equal(result.errors.length, 0);
  assert.equal(result.value?.port, null);
});

test("validateMonitorPayload validates interval_seconds bounds", () => {
  assert.equal(validateMonitorPayload(baseHttp()).value?.interval_seconds, 60);

  const tooLow = validateMonitorPayload(baseHttp({ interval_seconds: 5 }));
  assert.ok(tooLow.errors.some((e) => e.startsWith("interval_seconds:")));

  const tooHigh = validateMonitorPayload(
    baseHttp({ interval_seconds: 999999 })
  );
  assert.ok(tooHigh.errors.some((e) => e.startsWith("interval_seconds:")));

  const nonInteger = validateMonitorPayload(
    baseHttp({ interval_seconds: 10.5 })
  );
  assert.ok(nonInteger.errors.some((e) => e.startsWith("interval_seconds:")));
});

test("validateMonitorPayload validates timeout_seconds bounds and relation to interval", () => {
  assert.equal(validateMonitorPayload(baseHttp()).value?.timeout_seconds, 10);

  const tooLow = validateMonitorPayload(baseHttp({ timeout_seconds: 0 }));
  assert.ok(tooLow.errors.some((e) => e.startsWith("timeout_seconds:")));

  const tooHigh = validateMonitorPayload(baseHttp({ timeout_seconds: 121 }));
  assert.ok(tooHigh.errors.some((e) => e.startsWith("timeout_seconds:")));

  const nonInteger = validateMonitorPayload(baseHttp({ timeout_seconds: 5.5 }));
  assert.ok(nonInteger.errors.some((e) => e.startsWith("timeout_seconds:")));

  const exceedsInterval = validateMonitorPayload(
    baseHttp({ interval_seconds: 30, timeout_seconds: 30 })
  );
  assert.ok(
    exceedsInterval.errors.some((e) =>
      e.includes("must be less than interval_seconds")
    )
  );

  // When interval isn't even an integer, the cross-field comparison must be skipped
  // rather than compared against a NaN-derived value.
  const nonIntegerInterval = validateMonitorPayload(
    baseHttp({ interval_seconds: 10.5, timeout_seconds: 5 })
  );
  assert.equal(
    nonIntegerInterval.errors.filter((e) => e.startsWith("timeout_seconds:"))
      .length,
    0
  );
});

test("validateMonitorPayload validates retries bounds", () => {
  assert.equal(validateMonitorPayload(baseHttp()).value?.retries, 0);

  const negative = validateMonitorPayload(baseHttp({ retries: -1 }));
  assert.ok(negative.errors.some((e) => e.startsWith("retries:")));

  const tooHigh = validateMonitorPayload(baseHttp({ retries: 11 }));
  assert.ok(tooHigh.errors.some((e) => e.startsWith("retries:")));

  const nonInteger = validateMonitorPayload(baseHttp({ retries: 1.5 }));
  assert.ok(nonInteger.errors.some((e) => e.startsWith("retries:")));

  const valid = validateMonitorPayload(baseHttp({ retries: 3 }));
  assert.equal(valid.value?.retries, 3);
});

test("validateMonitorPayload applies boolean defaults and honors explicit values", () => {
  const defaults = validateMonitorPayload(baseHttp());
  assert.equal(defaults.value?.follow_redirects, true);
  assert.equal(defaults.value?.verify_ssl, true);
  assert.equal(defaults.value?.is_active, true);
  assert.equal(defaults.value?.notify_enabled, true);

  const explicit = validateMonitorPayload(
    baseHttp({
      follow_redirects: false,
      verify_ssl: false,
      is_active: false,
      notify_enabled: false,
    })
  );
  assert.equal(explicit.value?.follow_redirects, false);
  assert.equal(explicit.value?.verify_ssl, false);
  assert.equal(explicit.value?.is_active, false);
  assert.equal(explicit.value?.notify_enabled, false);

  // Non-boolean values fall back to the default rather than being coerced.
  const nonBoolean = validateMonitorPayload(
    baseHttp({ follow_redirects: "false" })
  );
  assert.equal(nonBoolean.value?.follow_redirects, true);
});

test("validateMonitorPayload returns a fully populated value for each monitor type on success", () => {
  const http = validateMonitorPayload(baseHttp());
  assert.equal(http.errors.length, 0);
  assert.equal(http.value?.type, "http");

  const tcp = validateMonitorPayload(baseTcp());
  assert.equal(tcp.errors.length, 0);
  assert.equal(tcp.value?.type, "tcp");

  const ping = validateMonitorPayload(basePing());
  assert.equal(ping.errors.length, 0);
  assert.equal(ping.value?.type, "ping");
});
