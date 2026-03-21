import { NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    // normalize localhost variants
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
    }
    // normalize trailing slash issues
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function matchesRequestOrigin(
  candidate: string,
  requestOrigin: string,
): boolean {
  return normalizeOrigin(candidate) === normalizeOrigin(requestOrigin);
}

const CSRF_EXCLUDED_PATHS = ["/api/logs"];
export function checkCsrfProtection(req: NextRequest): NextResponse | null {
  if (
    CSRF_EXCLUDED_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))
  ) {
    return null;
  }

  if (SAFE_METHODS.has(req.method)) {
    return null;
  }

  const isDev = process.env.NODE_ENV !== "production";

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const requestOrigin = host ? `${proto}://${host}` : req.nextUrl.origin;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const fetchSite = req.headers.get("sec-fetch-site");

  if (origin) {
    if (matchesRequestOrigin(origin, requestOrigin)) {
      return null;
    }
    return NextResponse.json(
      { error: "CSRF check failed: request origin does not match this server" },
      { status: 403 },
    );
  }

  if (referer) {
    if (matchesRequestOrigin(referer, requestOrigin)) {
      return null;
    }
    return NextResponse.json(
      { error: "CSRF check failed: request origin does not match this server" },
      { status: 403 },
    );
  }

  if (fetchSite === "same-origin" || fetchSite === "same-site") {
    return null;
  }

  if (isDev && fetchSite === "none") {
    return null;
  }

  return NextResponse.json(
    { error: "CSRF check failed: missing same-origin request metadata" },
    { status: 403 },
  );
}
