import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWhoisReferral,
  getRegistrableDomain,
  isIpAddress,
  parseWhoisExpiry,
  parseWhoisRegistrar,
} from "../lib/domain-utils";

test("isIpAddress recognizes IPv4 and IPv6 literals but not hostnames", () => {
  assert.equal(isIpAddress("10.0.0.5"), true);
  assert.equal(isIpAddress("255.255.255.255"), true);
  assert.equal(isIpAddress("::1"), true);
  assert.equal(isIpAddress("2001:db8::1"), true);
  assert.equal(isIpAddress("example.com"), false);
  assert.equal(isIpAddress("db.internal"), false);
});

test("getRegistrableDomain strips subdomains down to the registrable domain", () => {
  assert.equal(getRegistrableDomain("example.com"), "example.com");
  assert.equal(getRegistrableDomain("api.example.com"), "example.com");
  assert.equal(getRegistrableDomain("a.b.api.example.com"), "example.com");
});

test("getRegistrableDomain always takes the last two labels, even for two-part TLDs", () => {
  // Known limitation: "example.co.uk" resolves to "co.uk", not the real
  // registrable domain. There's no public-suffix list backing this.
  assert.equal(getRegistrableDomain("example.co.uk"), "co.uk");
  assert.equal(getRegistrableDomain("www.example.co.uk"), "co.uk");
});

test("extractWhoisReferral finds the referral server line case-insensitively", () => {
  assert.equal(
    extractWhoisReferral("domain: COM\nrefer:   whois.verisign-grs.com\n"),
    "whois.verisign-grs.com"
  );
  assert.equal(
    extractWhoisReferral("Whois Server: whois.nic.io\n"),
    "whois.nic.io"
  );
  // IANA's actual referral field is a bare "whois:", not "refer:" or
  // "whois server:" — this is the real format returned for e.g. "com".
  assert.equal(
    extractWhoisReferral("domain: COM\nwhois:        whois.verisign-grs.com\n"),
    "whois.verisign-grs.com"
  );
  assert.equal(extractWhoisReferral("no referral here"), null);
});

test("parseWhoisExpiry matches common registry/registrar field names", () => {
  assert.equal(
    parseWhoisExpiry("Registry Expiry Date: 2027-03-05T00:00:00Z\n"),
    new Date("2027-03-05T00:00:00Z").toISOString()
  );
  assert.equal(
    parseWhoisExpiry(
      "Registrar Registration Expiration Date: 2027-03-05T00:00:00Z\n"
    ),
    new Date("2027-03-05T00:00:00Z").toISOString()
  );
  assert.equal(
    parseWhoisExpiry("expire: 2027-03-05\n"),
    new Date("2027-03-05").toISOString()
  );
});

test("parseWhoisExpiry returns null when no field matches or the date is unparseable", () => {
  assert.equal(parseWhoisExpiry("Domain Name: EXAMPLE.COM\n"), null);
  assert.equal(parseWhoisExpiry("Expiry Date: not-a-date\n"), null);
});

test("parseWhoisRegistrar extracts the Registrar field", () => {
  assert.equal(
    parseWhoisRegistrar("Registrar: Example Registrar, Inc.\n"),
    "Example Registrar, Inc."
  );
  assert.equal(parseWhoisRegistrar("Domain Name: EXAMPLE.COM\n"), null);
});
