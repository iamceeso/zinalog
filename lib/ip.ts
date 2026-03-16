import { NextRequest } from "next/server";

const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");

export function parseIpv4ToBigInt(value: string): bigint | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  let result = BigInt(0);
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;

    const octet = Number.parseInt(part, 10);
    if (octet < 0 || octet > 255) return null;

    result = (result << BigInt(8)) + BigInt(octet);
  }

  return result;
}

export function parseIpv6ToBigInt(value: string): bigint | null {
  let ip = value.toLowerCase();

  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    if (lastColon < 0) return null;

    const ipv4Part = ip.slice(lastColon + 1);
    const parsedIpv4 = parseIpv4ToBigInt(ipv4Part);
    if (parsedIpv4 === null) return null;

    const upper = Number((parsedIpv4 >> BigInt(16)) & BigInt(0xffff))
      .toString(16)
      .padStart(4, "0");
    const lower = Number(parsedIpv4 & BigInt(0xffff))
      .toString(16)
      .padStart(4, "0");
    ip = `${ip.slice(0, lastColon)}:${upper}:${lower}`;
  }

  const doubleColonParts = ip.split("::");
  if (doubleColonParts.length > 2) return null;

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(":").filter(Boolean)
    : [];
  const right =
    doubleColonParts.length === 2 && doubleColonParts[1]
      ? doubleColonParts[1].split(":").filter(Boolean)
      : [];

  const missingGroups = 8 - (left.length + right.length);
  if (
    (doubleColonParts.length === 1 && missingGroups !== 0) ||
    missingGroups < 0
  ) {
    return null;
  }

  const groups =
    doubleColonParts.length === 2
      ? [...left, ...Array(missingGroups).fill("0"), ...right]
      : left;

  if (groups.length !== 8) return null;

  let result = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    result = (result << BigInt(16)) + BigInt(Number.parseInt(group, 16));
  }

  return result;
}

export function getIpFamily(value: string): 0 | 4 | 6 {
  if (parseIpv4ToBigInt(value) !== null) return 4;
  if (parseIpv6ToBigInt(value) !== null) return 6;
  return 0;
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;

  let ip = value.trim();
  if (!ip) return null;

  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }

  const zoneIndex = ip.indexOf("%");
  if (zoneIndex >= 0) {
    ip = ip.slice(0, zoneIndex);
  }

  const ipv4WithPort = ip.match(/^(.+):(\d+)$/);
  if (ipv4WithPort && getIpFamily(ipv4WithPort[1]) === 4) {
    ip = ipv4WithPort[1];
  }

  if (ip.startsWith("::ffff:")) {
    const mappedIpv4 = ip.slice("::ffff:".length);
    if (getIpFamily(mappedIpv4) === 4) {
      ip = mappedIpv4;
    }
  }

  if (getIpFamily(ip) === 0) {
    return null;
  }

  return ip.toLowerCase();
}

function getDirectIp(req: NextRequest): string | null {
  const candidate = (req as NextRequest & { ip?: string | null }).ip;
  return normalizeIp(candidate);
}

function getTrustedProxyIp(req: NextRequest): string | null {
  if (!TRUST_PROXY) return null;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const normalized = normalizeIp(forwardedFor.split(",")[0]);
    if (normalized) return normalized;
  }

  return normalizeIp(req.headers.get("x-real-ip"));
}

export function getClientIp(req: NextRequest): string {
  return getTrustedProxyIp(req) ?? getDirectIp(req) ?? "unknown";
}
