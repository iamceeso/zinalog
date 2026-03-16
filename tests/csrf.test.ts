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
