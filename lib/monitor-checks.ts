import { Socket } from "node:net";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { connect as tlsConnect, type PeerCertificate } from "node:tls";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import axios from "axios";
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

export function describeFetchError(
  err: unknown,
  timeoutSeconds: number
): string {
  if (axios.isAxiosError(err)) {
    if (
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT" ||
      err.message.toLowerCase().includes("timeout")
    ) {
      return `Request timed out after ${timeoutSeconds}s`;
    }
    return err.message;
  }

  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return `Request timed out after ${timeoutSeconds}s`;
    }
    return err.message;
  }
  return "Request failed";
}

export interface SslInfo {
  expires_at: string | null;
  issuer: string | null;
  valid: boolean;
}

export function buildSslInfo(
  cert: PeerCertificate | undefined,
  authorized: boolean
): SslInfo | null {
  if (!cert || Object.keys(cert).length === 0) return null;

  const issuerValue = cert.issuer?.O ?? cert.issuer?.CN ?? null;
  return {
    expires_at: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
    issuer: Array.isArray(issuerValue) ? (issuerValue[0] ?? null) : issuerValue,
    valid: authorized,
  };
}

export interface TlsSocketLike {
  once(
    event: "secureConnect" | "timeout" | "error",
    listener: () => void
  ): unknown;
  getPeerCertificate(): PeerCertificate;
  authorized: boolean;
  destroy(): unknown;
}

export function getSslInfo(
  hostname: string,
  port: number,
  timeoutMs: number,
  rejectUnauthorized: boolean,
  connect: () => TlsSocketLike = () =>
    tlsConnect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized,
      timeout: timeoutMs,
    })
): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    let settled = false;

    const socket = connect();

    const finish = (value: SslInfo | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once("secureConnect", () => {
      finish(buildSslInfo(socket.getPeerCertificate(), socket.authorized));
    });
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

export async function checkHttp(monitor: Monitor): Promise<MonitorCheckResult> {
  const url = new URL(monitor.target);
  const timeoutMs = Math.max(1, monitor.timeout_seconds) * 1000;
  const verifySsl = monitor.verify_ssl !== 0;

  let headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  };
  if (monitor.headers) {
    try {
      headers = { ...headers, ...JSON.parse(decryptSecret(monitor.headers)) };
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

  const httpAgent = new HttpAgent({ timeout: timeoutMs });
  const httpsAgent = new HttpsAgent({
    rejectUnauthorized: verifySsl,
    timeout: timeoutMs,
  });

  const start = Date.now();
  let result: MonitorCheckResult;

  try {
    const res = await axios.request<unknown>({
      url: url.toString(),
      method: monitor.method || "GET",
      headers,
      timeout: timeoutMs,
      maxRedirects: monitor.follow_redirects ? 5 : 0,
      httpAgent,
      httpsAgent,
      proxy: false,
      responseType: "stream",
      validateStatus: () => true,
    });
    const responseTime = Date.now() - start;

    const responseBody = res.data as
      { destroy?: () => void } | null | undefined;
    responseBody?.destroy?.();

    if (res.status === 403 && res.headers["cf-mitigated"] === "challenge") {
      result = {
        status: "blocked",
        status_code: res.status,
        response_time_ms: responseTime,
        error: "Cloudflare Managed Challenge",
      };
    } else {
      const isExpected = parseExpectedStatus(monitor.expected_status)(
        res.status
      );
      result = {
        status: isExpected ? "up" : "down",
        status_code: res.status,
        response_time_ms: responseTime,
        error: isExpected ? null : `Unexpected status code ${res.status}`,
      };
    }
  } catch (err) {
    result = {
      status: "down",
      response_time_ms: Date.now() - start,
      error: describeFetchError(err, monitor.timeout_seconds),
    };
  }

  if (url.protocol === "https:") {
    const sslPort = url.port ? Number(url.port) : 443;
    result.ssl = await getSslInfo(url.hostname, sslPort, timeoutMs, verifySsl);
  }

  return result;
}

export interface TcpSocketLike {
  setTimeout(ms: number): unknown;
  once(event: "connect" | "timeout", listener: () => void): unknown;
  once(event: "error", listener: (err: Error) => void): unknown;
  connect(port: number, host: string): unknown;
  destroy(): unknown;
}

export function checkTcp(
  monitor: Monitor,
  createSocket: () => TcpSocketLike = () => new Socket()
): Promise<MonitorCheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = createSocket();
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

export type PingRunner = (
  target: string,
  timeoutSec: number
) => Promise<{ stdout: string }>;

async function defaultRunPing(
  target: string,
  timeoutSec: number
): Promise<{ stdout: string }> {
  return execFileAsync("ping", ["-c", "1", "-W", String(timeoutSec), target], {
    timeout: (timeoutSec + 2) * 1000,
  });
}

export async function checkPing(
  monitor: Monitor,
  runPing: PingRunner = defaultRunPing
): Promise<MonitorCheckResult> {
  const start = Date.now();
  const timeoutSec = Math.max(1, monitor.timeout_seconds);

  try {
    const { stdout } = await runPing(monitor.target, timeoutSec);
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
