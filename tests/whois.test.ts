import assert from "node:assert/strict";
import test from "node:test";
import {
  getDomainInfo,
  rawWhoisQuery,
  type WhoisSocketLike,
} from "../lib/whois";

//  rawWhoisQuery

test("rawWhoisQuery writes the query on connect and resolves with the buffered response on close", async () => {
  const writes: string[] = [];
  const connectArgs: [number, string][] = [];

  let dataListener: ((chunk: Buffer) => void) | null = null;
  let closeListener: (() => void) | null = null;

  const fakeSocket: WhoisSocketLike = {
    setTimeout() {
      return this;
    },
    write(data) {
      writes.push(data);
      return this;
    },
    on(event, listener) {
      if (event === "data") dataListener = listener;
      return this;
    },
    once(event, listener) {
      if (event === "close") closeListener = listener as () => void;
      if (event === "connect") {
        // Simulate the server replying and closing only after connect+write,
        // so "data" is always buffered before "close" resolves the query.
        setImmediate(() => {
          (listener as () => void)();
          dataListener?.(Buffer.from("Domain Name: EXAMPLE.COM\n"));
          closeListener?.();
        });
      }
      return this;
    },
    connect(port, host) {
      connectArgs.push([port, host]);
      return this;
    },
    destroy() {
      return this;
    },
  };

  const result = await rawWhoisQuery(
    "whois.example-registry.net",
    "example.com",
    1000,
    () => fakeSocket
  );

  assert.equal(result, "Domain Name: EXAMPLE.COM\n");
  assert.deepEqual(connectArgs, [[43, "whois.example-registry.net"]]);
  assert.equal(writes[0], "example.com\r\n");
});

test("rawWhoisQuery resolves null on timeout or error, ignoring late duplicate events", async () => {
  const fakeSocket: WhoisSocketLike = {
    setTimeout() {
      return this;
    },
    write() {
      return this;
    },
    on() {
      return this;
    },
    once(event, listener) {
      if (event === "timeout") {
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

  const result = await rawWhoisQuery(
    "whois.example.com",
    "example.com",
    1000,
    () => fakeSocket
  );
  assert.equal(result, null);
});

//  getDomainInfo

test("getDomainInfo returns null for IP address targets without querying WHOIS", async () => {
  let calls = 0;
  const query = async () => {
    calls += 1;
    return null;
  };

  const result = await getDomainInfo("10.0.0.5", 1000, query);
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("getDomainInfo returns null when the IANA lookup itself fails", async () => {
  const query = async () => null;
  const result = await getDomainInfo("example.com", 1000, query);
  assert.equal(result, null);
});

test("getDomainInfo follows the IANA referral and parses the registry's response", async () => {
  const calls: [string, string][] = [];
  const query = async (server: string, q: string) => {
    calls.push([server, q]);
    if (server === "whois.iana.org") {
      return "domain: COM\nrefer: whois.verisign-grs.com\n";
    }
    if (server === "whois.verisign-grs.com") {
      return "Registrar: Example Registrar, Inc.\nRegistry Expiry Date: 2027-03-05T00:00:00Z\n";
    }
    return null;
  };

  const result = await getDomainInfo("api.example.com", 1000, query);

  assert.deepEqual(result, {
    expires_at: new Date("2027-03-05T00:00:00Z").toISOString(),
    registrar: "Example Registrar, Inc.",
  });
  assert.deepEqual(calls, [
    ["whois.iana.org", "com"],
    ["whois.verisign-grs.com", "example.com"],
  ]);
});

test("getDomainInfo falls back to the IANA server itself when no referral is present", async () => {
  const calls: string[] = [];
  const query = async (server: string) => {
    calls.push(server);
    return "Registry Expiry Date: 2027-03-05T00:00:00Z\n";
  };

  const result = await getDomainInfo("example.com", 1000, query);

  assert.equal(
    result?.expires_at,
    new Date("2027-03-05T00:00:00Z").toISOString()
  );
  assert.deepEqual(calls, ["whois.iana.org", "whois.iana.org"]);
});

test("getDomainInfo returns null when the referral query fails", async () => {
  const query = async (server: string) => {
    if (server === "whois.iana.org") return "refer: whois.verisign-grs.com\n";
    return null;
  };

  const result = await getDomainInfo("example.com", 1000, query);
  assert.equal(result, null);
});
