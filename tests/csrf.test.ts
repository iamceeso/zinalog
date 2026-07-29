import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { checkCsrfProtection } from "../lib/csrf";

function createRequest(input?: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
}) {
  return new NextRequest(input?.url ?? "http://localhost/api/settings", {
    method: input?.method ?? "POST",
    headers: new Headers(input?.headers),
  });
}

test("checkCsrfProtection allows safe methods without origin checks", () => {
  const request = createRequest({
    method: "GET",
    headers: { origin: "https://evil.example" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection accepts matching Origin headers", () => {
  const request = createRequest({
    headers: { origin: "http://localhost" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection accepts localhost aliases after origin normalization", () => {
  const request = createRequest({
    url: "http://localhost/api/settings",
    headers: { origin: "http://127.0.0.1" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection accepts matching Referer headers", () => {
  const request = createRequest({
    headers: { referer: "http://localhost/dashboard/settings" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection accepts same-origin fetch metadata when Origin is absent", () => {
  const request = createRequest({
    headers: { "sec-fetch-site": "same-origin" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection accepts same-site fetch metadata", () => {
  const request = createRequest({
    headers: { "sec-fetch-site": "same-site" },
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection skips CSRF checks for excluded log ingestion paths", () => {
  const request = createRequest({
    url: "http://localhost/api/logs/ingest",
  });

  assert.equal(checkCsrfProtection(request), null);
});

test("checkCsrfProtection rejects cross-site origins", async () => {
  const request = createRequest({
    headers: { origin: "https://evil.example" },
  });

  const blocked = checkCsrfProtection(request);
  assert.ok(blocked);
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), {
    error: "CSRF check failed: request origin does not match this server",
  });
});

test("checkCsrfProtection rejects requests without same-origin metadata", async () => {
  const request = createRequest();

  const blocked = checkCsrfProtection(request);
  assert.ok(blocked);
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), {
    error: "CSRF check failed: missing same-origin request metadata",
  });
});

test("checkCsrfProtection allows fetch-site none outside production development checks", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;

  try {
    const request = createRequest({
      headers: { "sec-fetch-site": "none" },
    });

    assert.equal(checkCsrfProtection(request), null);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("checkCsrfProtection rejects invalid referer origins", async () => {
  const request = createRequest({
    headers: { referer: "not a url" },
  });

  const blocked = checkCsrfProtection(request);
  assert.ok(blocked);
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), {
    error: "CSRF check failed: request origin does not match this server",
  });
});

test("checkCsrfProtection ignores forwarded host headers unless TRUST_PROXY is enabled", async () => {
  const previousTrustProxy = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;

  try {
    const request = createRequest({
      headers: {
        origin: "https://public.example.com",
        host: "public.example.com",
        "x-forwarded-host": "internal:4000",
        "x-forwarded-proto": "http",
      },
      url: "https://public.example.com/api/settings",
    });

    assert.equal(checkCsrfProtection(request), null);
  } finally {
    if (previousTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = previousTrustProxy;
    }
  }
});

test("checkCsrfProtection trusts forwarded host headers when TRUST_PROXY is enabled", async () => {
  const previousTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";

  try {
    const request = createRequest({
      headers: {
        origin: "https://public.example.com",
        host: "internal:4000",
        "x-forwarded-host": "public.example.com",
        "x-forwarded-proto": "https",
      },
      url: "http://internal:4000/api/settings",
    });

    assert.equal(checkCsrfProtection(request), null);
  } finally {
    if (previousTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = previousTrustProxy;
    }
  }
});

test("checkCsrfProtection falls back to host and default proto when forwarded values are missing", () => {
  const previousTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";

  try {
    const request = createRequest({
      headers: {
        host: "localhost:4000",
        origin: "http://localhost:4000",
      },
      url: "http://localhost:4000/api/settings",
    });

    assert.equal(checkCsrfProtection(request), null);
  } finally {
    if (previousTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = previousTrustProxy;
    }
  }
});

test("checkCsrfProtection rejects fetch-site none in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const request = createRequest({
      headers: { "sec-fetch-site": "none" },
    });

    const blocked = checkCsrfProtection(request);
    assert.ok(blocked);
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), {
      error: "CSRF check failed: missing same-origin request metadata",
    });
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
