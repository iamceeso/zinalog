import type { MonitorType } from "../db";
import { isMaskedSecret } from "./fields";

const VALID_TYPES: MonitorType[] = ["http", "tcp", "ping"];
const VALID_METHODS = [
  "GET",
  "POST",
  "HEAD",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
];
const STATUS_SPEC_RE = /^\d{3}(-\d{3})?(\s*,\s*\d{3}(-\d{3})?)*$/;
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;

export interface ValidatedMonitor {
  name: string;
  type: MonitorType;
  target: string;
  port: number | null;
  method: string | null;
  headers: string | null | undefined; // undefined = leave unchanged (masked)
  basic_auth_user: string | null;
  basic_auth_pass: string | null | undefined; // undefined = leave unchanged (masked)
  expected_status: string;
  interval_seconds: number;
  timeout_seconds: number;
  retries: number;
  follow_redirects: boolean;
  verify_ssl: boolean;
  is_active: boolean;
  notify_enabled: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function validateMonitorPayload(body: Record<string, unknown>): {
  errors: string[];
  value: ValidatedMonitor | null;
} {
  const errors: string[] = [];

  const name = (asString(body.name) ?? "").trim();
  if (!name || name.length > 100) {
    errors.push("name: required, 1-100 characters");
  }

  const type = asString(body.type) as MonitorType | null;
  if (!type || !VALID_TYPES.includes(type)) {
    errors.push(`type: must be one of ${VALID_TYPES.join(", ")}`);
  }

  const rawTarget = (asString(body.target) ?? "").trim();
  let target = rawTarget;
  let port: number | null = null;
  let method: string | null = null;
  let headers: string | null | undefined = undefined;
  let basicAuthUser: string | null = null;
  let basicAuthPass: string | null | undefined = undefined;
  let expectedStatus = "200-299";

  if (type === "http") {
    try {
      const url = new URL(rawTarget);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push("target: must use http:// or https://");
      }
      target = url.toString();
    } catch {
      errors.push("target: must be a valid URL (e.g. https://example.com)");
    }

    method = (asString(body.method) ?? "GET").toUpperCase();
    if (!VALID_METHODS.includes(method)) {
      errors.push(`method: must be one of ${VALID_METHODS.join(", ")}`);
    }

    if (body.headers !== undefined) {
      const rawHeaders = body.headers;
      if (rawHeaders === null || rawHeaders === "") {
        headers = null;
      } else if (typeof rawHeaders === "string" && isMaskedSecret(rawHeaders)) {
        headers = undefined;
      } else if (typeof rawHeaders === "object") {
        const entries = Object.entries(rawHeaders as Record<string, unknown>);
        if (entries.some(([, v]) => typeof v !== "string")) {
          errors.push("headers: all header values must be strings");
        } else {
          headers = JSON.stringify(Object.fromEntries(entries));
        }
      } else {
        errors.push("headers: must be an object of header name/value pairs");
      }
    }

    const rawUser = asString(body.basic_auth_user);
    basicAuthUser = rawUser && rawUser.trim() ? rawUser.trim() : null;

    if (body.basic_auth_pass !== undefined) {
      const rawPass = body.basic_auth_pass;
      if (rawPass === null || rawPass === "") {
        basicAuthPass = null;
      } else if (typeof rawPass === "string" && isMaskedSecret(rawPass)) {
        basicAuthPass = undefined;
      } else if (typeof rawPass === "string") {
        basicAuthPass = rawPass;
      } else {
        errors.push("basic_auth_pass: must be a string");
      }
    }

    const rawExpected = asString(body.expected_status);
    if (rawExpected && rawExpected.trim()) {
      expectedStatus = rawExpected.trim();
      if (!STATUS_SPEC_RE.test(expectedStatus)) {
        errors.push(
          "expected_status: must look like '200-299' or '200,301,302'"
        );
      }
    }
  } else if (type === "tcp" || type === "ping") {
    // http-only fields never apply to these monitor types
    method = null;
    headers = null;
    basicAuthUser = null;
    basicAuthPass = null;

    if (rawTarget.includes("://") || /\s/.test(rawTarget)) {
      errors.push("target: must be a bare hostname or IP address");
    } else if (!HOSTNAME_RE.test(rawTarget) && !rawTarget.includes(":")) {
      // allow IPv6 literals (contain ':') to pass through the hostname check
      errors.push("target: must be a bare hostname or IP address");
    }

    if (type === "tcp") {
      const rawPort = body.port;
      const parsedPort =
        typeof rawPort === "number" ? rawPort : Number(rawPort);
      if (
        !Number.isInteger(parsedPort) ||
        parsedPort < 1 ||
        parsedPort > 65535
      ) {
        errors.push("port: must be an integer between 1 and 65535");
      } else {
        port = parsedPort;
      }
    }
  }

  const intervalSeconds = Number(body.interval_seconds ?? 60);
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < 10 ||
    intervalSeconds > 86400
  ) {
    errors.push("interval_seconds: must be an integer between 10 and 86400");
  }

  const timeoutSeconds = Number(body.timeout_seconds ?? 10);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 120
  ) {
    errors.push("timeout_seconds: must be an integer between 1 and 120");
  } else if (
    Number.isInteger(intervalSeconds) &&
    timeoutSeconds >= intervalSeconds
  ) {
    errors.push("timeout_seconds: must be less than interval_seconds");
  }

  const retries = Number(body.retries ?? 0);
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
    errors.push("retries: must be an integer between 0 and 10");
  }

  if (errors.length > 0 || !type) {
    return { errors, value: null };
  }

  return {
    errors: [],
    value: {
      name,
      type,
      target,
      port,
      method,
      headers,
      basic_auth_user: basicAuthUser,
      basic_auth_pass: basicAuthPass,
      expected_status: expectedStatus,
      interval_seconds: intervalSeconds,
      timeout_seconds: timeoutSeconds,
      retries,
      follow_redirects: asBoolean(body.follow_redirects, true),
      verify_ssl: asBoolean(body.verify_ssl, true),
      is_active: asBoolean(body.is_active, true),
      notify_enabled: asBoolean(body.notify_enabled, true),
    },
  };
}
