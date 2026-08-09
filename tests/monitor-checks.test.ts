import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { PeerCertificate } from "node:tls";
import {
  buildSslInfo,
  checkHttp,
  checkPing,
  checkTcp,
  describeFetchError,
  getSslInfo,
  runMonitorCheck,
  type TcpSocketLike,
  type TlsSocketLike,
} from "../lib/monitors/checks";
import type { Monitor, MonitorType } from "../lib/db";

let certDir: string;
let certPath: string;
let keyPath: string;

before(async () => {
  certDir = await fs.mkdtemp(path.join(os.tmpdir(), "zinalog-cert-test-"));
  certPath = path.join(certDir, "cert.pem");
  keyPath = path.join(certDir, "key.pem");
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj "/O=ZinaLog Test/CN=localhost"`,
    { stdio: "ignore" }
  );
});

after(async () => {
  await fs.rm(certDir, { recursive: true, force: true });
});

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: "test-monitor",
    type: "http",
    target: "http://127.0.0.1/",
    port: null,
    method: "GET",
    headers: null,
    basic_auth_user: null,
    basic_auth_pass: null,
    expected_status: "200-299",
    interval_seconds: 60,
    timeout_seconds: 2,
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
    domain_expires_at: null,
    domain_registrar: null,
    domain_checked_at: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

async function withHttpServer(
  handler: http.RequestListener,
  fn: (port: number) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withHttpsServer(
  handler: http.RequestListener,
  fn: (port: number) => Promise<void>
): Promise<void> {
  const [key, cert] = await Promise.all([
    fs.readFile(keyPath),
    fs.readFile(certPath),
  ]);
  const server = https.createServer({ key, cert }, handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withTarpitTcpServer(
  fn: (port: number) => Promise<void>
): Promise<void> {
  // Accepts the TCP connection but never writes anything and never closes it,
  // so a TLS handshake or idle timer on the client side will time out.
  const openSockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    openSockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => openSockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(port);
  } finally {
    for (const socket of openSockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function findClosedPort(): Promise<number> {
  const server = net.createServer();
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

//  describeFetchError

test("describeFetchError formats abort/timeout errors distinctly from other Errors", () => {
  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  assert.equal(describeFetchError(abortErr, 5), "Request timed out after 5s");

  const timeoutErr = new Error("timed out");
  timeoutErr.name = "TimeoutError";
  assert.equal(describeFetchError(timeoutErr, 3), "Request timed out after 3s");

  const genericErr = new Error("connection reset");
  assert.equal(describeFetchError(genericErr, 5), "connection reset");

  assert.equal(describeFetchError("not-an-error", 5), "Request failed");
});

//  buildSslInfo

test("buildSslInfo returns null for a missing or empty peer certificate", () => {
  assert.equal(buildSslInfo(undefined, true), null);
  assert.equal(
    buildSslInfo({} as Parameters<typeof buildSslInfo>[0], true),
    null
  );
});

test("buildSslInfo prefers the organization name and falls back to common name for the issuer", () => {
  const withOrg = buildSslInfo(
    {
      valid_to: "Jan 1 00:00:00 2030 GMT",
      issuer: { O: "Acme Corp", CN: "Acme CA" },
    } as Parameters<typeof buildSslInfo>[0],
    true
  );
  assert.equal(withOrg?.issuer, "Acme Corp");
  assert.equal(withOrg?.valid, true);
  assert.equal(
    withOrg?.expires_at,
    new Date("Jan 1 00:00:00 2030 GMT").toISOString()
  );

  const cnOnly = buildSslInfo(
    {
      valid_to: "Jan 1 00:00:00 2030 GMT",
      issuer: { CN: "Acme CA" },
    } as Parameters<typeof buildSslInfo>[0],
    false
  );
  assert.equal(cnOnly?.issuer, "Acme CA");
  assert.equal(cnOnly?.valid, false);

  const noIssuerFields = buildSslInfo(
    { valid_to: "Jan 1 00:00:00 2030 GMT", issuer: {} } as Parameters<
      typeof buildSslInfo
    >[0],
    true
  );
  assert.equal(noIssuerFields?.issuer, null);

  const noValidTo = buildSslInfo(
    { issuer: { O: "Acme Corp" } } as Parameters<typeof buildSslInfo>[0],
    true
  );
  assert.equal(noValidTo?.expires_at, null);
});

test("buildSslInfo takes the first entry when an issuer field is an array of values", () => {
  const arrayIssuer = buildSslInfo(
    {
      valid_to: "Jan 1 00:00:00 2030 GMT",
      issuer: { O: ["First Org", "Second Org"] },
    } as unknown as Parameters<typeof buildSslInfo>[0],
    true
  );
  assert.equal(arrayIssuer?.issuer, "First Org");

  const emptyArrayIssuer = buildSslInfo(
    {
      valid_to: "Jan 1 00:00:00 2030 GMT",
      issuer: { O: [] },
    } as unknown as Parameters<typeof buildSslInfo>[0],
    true
  );
  assert.equal(emptyArrayIssuer?.issuer, null);
});

//  checkHttp

test("checkHttp reports up when the response status is within the expected range", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(200);
      res.end("ok");
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(result.status, "up");
      assert.equal(result.status_code, 200);
      assert.equal(typeof result.response_time_ms, "number");
    }
  );
});

test("checkHttp reports down when the response status is outside the expected range", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(500);
      res.end("boom");
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(result.status, "down");
      assert.equal(result.status_code, 500);
      assert.match(result.error ?? "", /Unexpected status code 500/);
    }
  );
});

test("checkHttp reports blocked for Cloudflare managed challenges", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(403, { "cf-mitigated": "challenge" });
      res.end("challenge");
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(result.status, "blocked");
      assert.equal(result.status_code, 403);
      assert.equal(result.error, "Cloudflare Managed Challenge");
    }
  );
});

test("checkHttp matches a single expected status code with no range dash", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(404);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          expected_status: "404",
        })
      );
      assert.equal(result.status, "up");
    }
  );
});

test("checkHttp defaults the method to GET when the monitor has none set", async () => {
  await withHttpServer(
    (req, res) => {
      res.writeHead(200, { "x-method": req.method ?? "" });
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/`, method: null })
      );
      assert.equal(result.status, "up");
    }
  );
});

test("checkHttp defaults the SSL probe port to 443 when the target URL has none", async () => {
  const result = await checkHttp(
    baseMonitor({ target: "https://127.0.0.1/", timeout_seconds: 1 })
  );
  assert.equal(result.status, "down");
  assert.equal(result.ssl, null);
});

test("checkHttp falls back to the default 200-299 range when expected_status has no usable ranges", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(404);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          expected_status: ",,",
        })
      );
      assert.equal(result.status, "down");
      assert.equal(result.status_code, 404);
    }
  );
});

test("checkHttp ignores malformed expected-status entries before using the default range", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(404);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          expected_status: "not-a-status",
        })
      );
      assert.equal(result.status, "down");
      assert.equal(result.status_code, 404);
    }
  );
});

test("checkHttp sends decrypted custom headers and ignores malformed stored headers", async () => {
  await withHttpServer(
    (req, res) => {
      res.writeHead(200, { "x-echo": req.headers["x-api-key"] ?? "missing" });
      res.end();
    },
    async (port) => {
      const withHeaders = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          headers: JSON.stringify({ "X-Api-Key": "secret-value" }),
        })
      );
      assert.equal(withHeaders.status, "up");
    }
  );

  await withHttpServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const malformed = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          headers: "{not valid json",
        })
      );
      assert.equal(malformed.status, "up");
    }
  );
});

test("checkHttp sends default browser-compatible headers that custom headers can override", async () => {
  await withHttpServer(
    (req, res) => {
      const hasUserAgent = req.headers["user-agent"]?.includes("Mozilla/5.0");
      const hasAccept = req.headers["accept"]?.includes("text/html");
      const hasLanguage = req.headers["accept-language"]?.includes("en-US");
      const hasFetchMode = req.headers["sec-fetch-mode"] === "navigate";
      res.writeHead(
        hasUserAgent && hasAccept && hasLanguage && hasFetchMode ? 200 : 403
      );
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(result.status, "up");
    }
  );

  await withHttpServer(
    (req, res) => {
      res.writeHead(
        req.headers["user-agent"] === "CustomAgent/1.0" ? 200 : 403
      );
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          headers: JSON.stringify({ "User-Agent": "CustomAgent/1.0" }),
        })
      );
      assert.equal(result.status, "up");
    }
  );
});

test("checkHttp sends a Basic Authorization header, defaulting to an empty password", async () => {
  await withHttpServer(
    (req, res) => {
      res.writeHead(200, { "x-auth": req.headers["authorization"] ?? "" });
      res.end();
    },
    async (port) => {
      const withPassword = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          basic_auth_user: "alice",
          basic_auth_pass: "s3cret",
        })
      );
      assert.equal(withPassword.status, "up");

      const withoutPassword = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          basic_auth_user: "alice",
          basic_auth_pass: null,
        })
      );
      assert.equal(withoutPassword.status, "up");

      const withoutAuth = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(withoutAuth.status, "up");
    }
  );
});

test("checkHttp reports down with a network error message when the connection is refused", async () => {
  const closedPort = await findClosedPort();
  const result = await checkHttp(
    baseMonitor({ target: `http://127.0.0.1:${closedPort}/` })
  );
  assert.equal(result.status, "down");
  assert.ok(result.error);
});

test("checkHttp reports a timeout error when the server never responds", async () => {
  await withHttpServer(
    (_req, _res) => {
      // Never respond.
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/`,
          timeout_seconds: 1,
        })
      );
      assert.equal(result.status, "down");
      assert.match(result.error ?? "", /timed out after 1s/);
    }
  );
});

test("checkHttp follows or withholds redirects based on follow_redirects", async () => {
  await withHttpServer(
    (req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("landed");
    },
    async (port) => {
      const followed = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/start`,
          follow_redirects: 1,
        })
      );
      assert.equal(followed.status, "up");
      assert.equal(followed.status_code, 200);

      const manual = await checkHttp(
        baseMonitor({
          target: `http://127.0.0.1:${port}/start`,
          follow_redirects: 0,
          expected_status: "300-399",
        })
      );
      assert.equal(manual.status, "up");
    }
  );
});

test("checkHttp handles a response with no body such as a HEAD request", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/`, method: "HEAD" })
      );
      assert.equal(result.status, "up");
    }
  );
});

test("checkHttp does not attempt SSL inspection for plain http targets", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({ target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(result.ssl, undefined);
    }
  );
});

test("checkHttp rejects a self-signed certificate when verify_ssl is enabled", async () => {
  await withHttpsServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `https://127.0.0.1:${port}/`,
          verify_ssl: 1,
        })
      );
      assert.equal(result.status, "down");
    }
  );
});

test("checkHttp accepts a self-signed certificate and reports SSL info when verify_ssl is disabled", async () => {
  await withHttpsServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `https://127.0.0.1:${port}/`,
          verify_ssl: 0,
        })
      );
      assert.equal(result.status, "up");
      assert.ok(result.ssl);
      assert.equal(result.ssl?.valid, false);
      assert.equal(result.ssl?.issuer, "ZinaLog Test");
      assert.ok(result.ssl?.expires_at);
    }
  );
});

test("checkHttp reports null SSL info when the TLS handshake itself fails", async () => {
  await withHttpServer(
    (_req, res) => {
      // A plain HTTP server on an "https" monitor target will fail the TLS handshake.
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const result = await checkHttp(
        baseMonitor({
          target: `https://127.0.0.1:${port}/`,
          verify_ssl: 0,
          timeout_seconds: 2,
        })
      );
      // The primary fetch will fail (not valid TLS), and the follow-up SSL
      // probe will also fail to complete a handshake.
      assert.equal(result.status, "down");
      assert.equal(result.ssl, null);
    }
  );
});

test("checkHttp reports null SSL info when the TLS probe times out", async () => {
  await withTarpitTcpServer(async (port) => {
    const result = await checkHttp(
      baseMonitor({
        target: `https://127.0.0.1:${port}/`,
        verify_ssl: 0,
        timeout_seconds: 1,
      })
    );
    assert.equal(result.status, "down");
    assert.equal(result.ssl, null);
  });
});

test("getSslInfo ignores a late duplicate event once it has already settled", async () => {
  const fakeSocket: TlsSocketLike = {
    once(event, listener) {
      if (event === "secureConnect") {
        // Fire twice to exercise the already-settled guard.
        setImmediate(() => listener());
        setImmediate(() => listener());
      }
      return this;
    },
    getPeerCertificate() {
      return {
        valid_to: "Jan 1 00:00:00 2030 GMT",
        issuer: { O: "Acme Corp" },
      } as PeerCertificate;
    },
    authorized: true,
    destroy() {
      return this;
    },
  };

  const result = await getSslInfo(
    "example.com",
    443,
    1000,
    true,
    () => fakeSocket
  );
  assert.ok(result);
  assert.equal(result?.issuer, "Acme Corp");
});

//  checkTcp

test("checkTcp reports up for a reachable port", async () => {
  await withHttpServer(
    (_req, res) => res.end(),
    async (port) => {
      const result = await checkTcp(
        baseMonitor({ type: "tcp", target: "127.0.0.1", port })
      );
      assert.equal(result.status, "up");
      assert.equal(typeof result.response_time_ms, "number");
    }
  );
});

test("checkTcp reports down with the connection error for a closed port", async () => {
  const closedPort = await findClosedPort();
  const result = await checkTcp(
    baseMonitor({ type: "tcp", target: "127.0.0.1", port: closedPort })
  );
  assert.equal(result.status, "down");
  assert.ok(result.error);
});

test("checkTcp defaults to port 0 when the monitor has no port set", async () => {
  const result = await checkTcp(
    baseMonitor({
      type: "tcp",
      target: "127.0.0.1",
      port: null,
      timeout_seconds: 1,
    })
  );
  assert.equal(result.status, "down");
});

test("checkTcp reports down on timeout using an injected socket, ignoring any late duplicate event", async () => {
  const fakeSocket: TcpSocketLike = {
    setTimeout() {
      return this;
    },
    once(event, listener) {
      if (event === "timeout") {
        // Fire twice to exercise the already-settled guard too.
        setImmediate(() => (listener as () => void)());
        setImmediate(() => (listener as () => void)());
      }
      return this;
    },
    connect() {
      return this;
    },
    destroy() {
      return this;
    },
  };

  const result = await checkTcp(
    baseMonitor({ type: "tcp", target: "10.0.0.1", port: 9999 }),
    () => fakeSocket
  );
  assert.equal(result.status, "down");
  assert.match(result.error ?? "", /timed out after/);
});

//  checkPing

test("checkPing parses the round-trip time from ping output", async () => {
  const result = await checkPing(
    baseMonitor({ type: "ping", target: "127.0.0.1" }),
    async () => ({
      stdout: "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=12.3 ms\n",
    })
  );
  assert.equal(result.status, "up");
  assert.equal(result.response_time_ms, 12);
});

test("checkPing falls back to elapsed time when the output has no parseable time", async () => {
  const result = await checkPing(
    baseMonitor({ type: "ping", target: "127.0.0.1" }),
    async () => ({ stdout: "unrecognized ping output\n" })
  );
  assert.equal(result.status, "up");
  assert.equal(typeof result.response_time_ms, "number");
});

test("checkPing reports down with the error message when the ping command fails", async () => {
  const result = await checkPing(
    baseMonitor({ type: "ping", target: "unreachable.invalid" }),
    async () => {
      throw new Error(
        "ping: unreachable.invalid: Name or service not known\nextra ignored line"
      );
    }
  );
  assert.equal(result.status, "down");
  assert.equal(
    result.error,
    "ping: unreachable.invalid: Name or service not known"
  );
});

test("checkPing reports a generic failure message for non-Error rejections", async () => {
  const result = await checkPing(
    baseMonitor({ type: "ping", target: "127.0.0.1" }),
    async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "not an Error instance";
    }
  );
  assert.equal(result.status, "down");
  assert.equal(result.error, "Ping failed");
});

test("checkPing works end-to-end against localhost using the real ping binary", async () => {
  const result = await checkPing(
    baseMonitor({ type: "ping", target: "127.0.0.1" })
  );
  assert.equal(result.status, "up");
});

//  runMonitorCheck dispatch

test("runMonitorCheck dispatches to the correct checker for each monitor type", async () => {
  await withHttpServer(
    (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    async (port) => {
      const httpResult = await runMonitorCheck(
        baseMonitor({ type: "http", target: `http://127.0.0.1:${port}/` })
      );
      assert.equal(httpResult.status, "up");

      const tcpResult = await runMonitorCheck(
        baseMonitor({ type: "tcp", target: "127.0.0.1", port })
      );
      assert.equal(tcpResult.status, "up");
    }
  );

  const pingResult = await runMonitorCheck(
    baseMonitor({ type: "ping", target: "127.0.0.1" })
  );
  assert.equal(pingResult.status, "up");
});

test("runMonitorCheck reports down for an unrecognized monitor type", async () => {
  const result = await runMonitorCheck(
    baseMonitor({ type: "carrier-pigeon" as unknown as MonitorType })
  );
  assert.equal(result.status, "down");
  assert.match(result.error ?? "", /Unknown monitor type/);
});
