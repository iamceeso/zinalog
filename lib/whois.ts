import { Socket } from "node:net";
import {
  extractWhoisReferral,
  getRegistrableDomain,
  isIpAddress,
  parseWhoisExpiry,
  parseWhoisRegistrar,
} from "./domain-utils";

export interface DomainInfo {
  expires_at: string | null;
  registrar: string | null;
}

export interface WhoisSocketLike {
  setTimeout(ms: number): unknown;
  write(data: string): unknown;
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  once(event: "close" | "timeout", listener: () => void): unknown;
  once(event: "error", listener: (err: Error) => void): unknown;
  once(event: "connect", listener: () => void): unknown;
  connect(port: number, host: string): unknown;
  destroy(): unknown;
}

export function rawWhoisQuery(
  server: string,
  query: string,
  timeoutMs: number,
  createSocket: () => WhoisSocketLike = () => new Socket()
): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket();
    let settled = false;
    let buffer = "";

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
    socket.once("close", () => finish(buffer || null));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
    });
    socket.once("connect", () => {
      socket.write(`${query}\r\n`);
    });

    socket.connect(43, server);
  });
}

const IANA_WHOIS_SERVER = "whois.iana.org";

// WHOIS has no single canonical server: IANA's root server refers each
// query to the registry that actually holds the record for that TLD.
export async function getDomainInfo(
  hostname: string,
  timeoutMs = 5000,
  query: typeof rawWhoisQuery = rawWhoisQuery
): Promise<DomainInfo | null> {
  if (isIpAddress(hostname)) return null;

  const domain = getRegistrableDomain(hostname);
  const tld = domain.split(".").pop();
  if (!tld) return null;

  const ianaResponse = await query(IANA_WHOIS_SERVER, tld, timeoutMs);
  if (!ianaResponse) return null;

  const referralServer =
    extractWhoisReferral(ianaResponse) ?? IANA_WHOIS_SERVER;
  const response = await query(referralServer, domain, timeoutMs);
  if (!response) return null;

  return {
    expires_at: parseWhoisExpiry(response),
    registrar: parseWhoisRegistrar(response),
  };
}
