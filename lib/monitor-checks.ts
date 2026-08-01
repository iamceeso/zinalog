import net from "node:net";
import tls from "node:tls";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Agent, fetch as undiciFetch } from "undici";
import { decryptSecret } from "./secret-crypto";
import type { Monitor, MonitorCheckResult } from "./db";

const execFileAsync = promisify(execFile);

function parseExpectedStatus(spec: string): (code: number) => boolean {
  const ranges = spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [minRaw, maxRaw] = part.split("-");
      const min = parseInt(minRaw, 10);
      const max = maxRaw !== undefined ? parseInt(maxRaw, 10) : min;
      return { min, max };
    })
    .filter((r) => Number.isFinite(r.min) && Number.isFinite(r.max));

  if (ranges.length === 0) {
    return (code) => code >= 200 && code < 300;
  }

  return (code) => ranges.some((r) => code >= r.min && code <= r.max);
}

function describeFetchError(err: unknown, timeoutSeconds: number): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return `Request timed out after ${timeoutSeconds}s`;
    }
    return err.message;
  }
  return "Request failed";
}

interface SslInfo {
  expires_at: string | null;
  issuer: string | null;
  valid: boolean;
}

function getSslInfo(
  hostname: string,
  port: number,
  timeoutMs: number,
  rejectUnauthorized: boolean
): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    let settled = false;

    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized,
      timeout: timeoutMs,
    });

    const finish = (value: SslInfo | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        finish(null);
        return;
      }
      const issuerValue = cert.issuer?.O ?? cert.issuer?.CN ?? null;
      finish({
        expires_at: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
        issuer: Array.isArray(issuerValue) ? (issuerValue[0] ?? null) : issuerValue,
        valid: socket.authorized,
      });
    });
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

export async function checkHttp(monitor: Monitor): Promise<MonitorCheckResult> {
  const url = new URL(monitor.target);
  const timeoutMs = Math.max(1, monitor.timeout_seconds) * 1000;
  const verifySsl = monitor.verify_ssl !== 0;

  let headers: Record<string, string> = {};
  if (monitor.headers) {
    try {
      headers = JSON.parse(decryptSecret(monitor.headers));
    } catch {
      /* ignore malformed stored headers */
    }
  }

  if (monitor.basic_auth_user) {
    const pass = monitor.basic_auth_pass
      ? decryptSecret(monitor.basic_auth_pass)
      : "";
    headers["Authorization"] =
      "Basic " +
      Buffer.from(`${monitor.basic_auth_user}:${pass}`).toString("base64");
  }

  const agent = new Agent({
    connect: { rejectUnauthorized: verifySsl, timeout: timeoutMs },
  });

  const start = Date.now();
  let result: MonitorCheckResult;

  try {
    const res = await undiciFetch(url, {
      method: monitor.method || "GET",
      headers,
      redirect: monitor.follow_redirects ? "follow" : "manual",
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher: agent,
    });
    const responseTime = Date.now() - start;
    const isExpected = parseExpectedStatus(monitor.expected_status)(res.status);
    result = {
      status: isExpected ? "up" : "down",
      status_code: res.status,
      response_time_ms: responseTime,
      error: isExpected ? null : `Unexpected status code ${res.status}`,
    };
    await res.body?.cancel().catch(() => {});
  } catch (err) {
    result = {
      status: "down",
      response_time_ms: Date.now() - start,
      error: describeFetchError(err, monitor.timeout_seconds),
    };
  } finally {
    await agent.close().catch(() => {});
  }

  if (url.protocol === "https:") {
    const sslPort = url.port ? Number(url.port) : 443;
    result.ssl = await getSslInfo(url.hostname, sslPort, timeoutMs, verifySsl);
  }

  return result;
}

function checkTcp(monitor: Monitor): Promise<MonitorCheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    const timeoutMs = Math.max(1, monitor.timeout_seconds) * 1000;
    let settled = false;

    const finish = (result: MonitorCheckResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish({ status: "up", response_time_ms: Date.now() - start });
    });
    socket.once("timeout", () => {
      finish({
        status: "down",
        response_time_ms: Date.now() - start,
        error: `Connection timed out after ${monitor.timeout_seconds}s`,
      });
    });
    socket.once("error", (err) => {
      finish({
        status: "down",
        response_time_ms: Date.now() - start,
        error: err.message,
      });
    });

    socket.connect(monitor.port ?? 0, monitor.target);
  });
}

async function checkPing(monitor: Monitor): Promise<MonitorCheckResult> {
  const start = Date.now();
  const timeoutSec = Math.max(1, monitor.timeout_seconds);

  try {
    const { stdout } = await execFileAsync(
      "ping",
      ["-c", "1", "-W", String(timeoutSec), monitor.target],
      { timeout: (timeoutSec + 2) * 1000 }
    );
    const elapsed = Date.now() - start;
    const match = stdout.match(/time[=<]([\d.]+)\s*ms/i);
    const responseMs = match ? Math.round(parseFloat(match[1])) : elapsed;
    return { status: "up", response_time_ms: responseMs };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.split("\n")[0] : "Ping failed";
    return {
      status: "down",
      response_time_ms: Date.now() - start,
      error: message,
    };
  }
}

export async function runMonitorCheck(
  monitor: Monitor
): Promise<MonitorCheckResult> {
  switch (monitor.type) {
    case "http":
      return checkHttp(monitor);
    case "tcp":
      return checkTcp(monitor);
    case "ping":
      return checkPing(monitor);
    default:
      return { status: "down", error: `Unknown monitor type: ${monitor.type}` };
  }
}
