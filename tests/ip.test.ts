import assert from "node:assert/strict";
import test from "node:test";
import {
  getIpFamily,
  normalizeIp,
  parseIpv4ToBigInt,
  parseIpv6ToBigInt,
} from "../lib/ip";

test("parseIpv4ToBigInt parses valid IPv4 and rejects invalid input", () => {
  assert.equal(parseIpv4ToBigInt("192.168.0.1"), BigInt(3232235521));
  assert.equal(parseIpv4ToBigInt("192.168.0"), null);
  assert.equal(parseIpv4ToBigInt("192.168.0.256"), null);
  assert.equal(parseIpv4ToBigInt("192.168.0.one"), null);
});

test("parseIpv6ToBigInt parses compressed and IPv4-mapped addresses", () => {
  assert.ok(parseIpv6ToBigInt("2001:db8::1"));
  assert.ok(parseIpv6ToBigInt("::ffff:192.0.2.10"));
  assert.ok(parseIpv6ToBigInt("2001:db8::"));
  assert.equal(parseIpv6ToBigInt("192.0.2.10"), null);
  assert.equal(parseIpv6ToBigInt("2001:db8:1"), null);
  assert.equal(parseIpv6ToBigInt("gggg::1"), null);
  assert.equal(parseIpv6ToBigInt("2001::db8::1"), null);
  assert.equal(parseIpv6ToBigInt("1:2:3:4:5:6:7:8:9"), null);
  assert.equal(parseIpv6ToBigInt("::ffff:not-an-ip"), null);
});

test("getIpFamily and normalizeIp handle brackets, ports, zones, and invalid values", () => {
  assert.equal(getIpFamily("203.0.113.7"), 4);
  assert.equal(getIpFamily("2001:db8::7"), 6);
  assert.equal(getIpFamily("definitely-not-an-ip"), 0);

  assert.equal(normalizeIp("[2001:db8::1]"), "2001:db8::1");
  assert.equal(normalizeIp("fe80::1%lo0"), "fe80::1");
  assert.equal(normalizeIp("192.0.2.33:8080"), "192.0.2.33");
  assert.equal(normalizeIp("2001:db8::1:443"), "2001:db8::1:443");
  assert.equal(normalizeIp("::ffff:198.51.100.10"), "198.51.100.10");
  assert.equal(normalizeIp(null), null);
  assert.equal(normalizeIp(undefined), null);
  assert.equal(normalizeIp("   "), null);
  assert.equal(normalizeIp(""), null);
  assert.equal(normalizeIp("not-an-ip"), null);
});
