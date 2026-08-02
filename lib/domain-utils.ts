// Pure, environment-agnostic helpers for domain/WHOIS parsing.
// No node:net here so this stays safe to import from client components.

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]*:[0-9a-fA-F:]*$/;

export function isIpAddress(host: string): boolean {
  return IPV4_RE.test(host) || IPV6_RE.test(host);
}

// Not a full public-suffix-list implementation — just the last two
// labels (e.g. "api.example.com" -> "example.com"). Two-part suffixes
// like "example.co.uk" resolve to "co.uk" instead of the real
// registrable domain, so WHOIS lookups for those TLDs won't be accurate.
export function getRegistrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  return labels.slice(-2).join(".");
}

const REFERRAL_RE =
  /^\s*(?:refer|whois|whois server|registrar whois server)\s*:\s*(\S+)/im;

export function extractWhoisReferral(text: string): string | null {
  const match = text.match(REFERRAL_RE);
  return match ? match[1].trim() : null;
}

const EXPIRY_FIELD_RE =
  /^\s*(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiry Date|Expiration Date|Expiration Time|paid-till|expire|renewal date)\s*:\s*(.+)$/im;

export function parseWhoisExpiry(text: string): string | null {
  const match = text.match(EXPIRY_FIELD_RE);
  if (!match) return null;
  const date = new Date(match[1].trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const REGISTRAR_FIELD_RE = /^\s*Registrar\s*:\s*(.+)$/im;

export function parseWhoisRegistrar(text: string): string | null {
  const match = text.match(REGISTRAR_FIELD_RE);
  return match ? match[1].trim() : null;
}
