import { NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    // normalize localhost variants
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
    }
    return url.origin;
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

export function checkCsrfProtection(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) {
    return null;
  }
  const isDev = process.env.NODE_ENV !== "production";
  const requestOrigin = req.nextUrl.origin;

  const origin = req.headers.get("origin");
  if (origin) {
    if (matchesRequestOrigin(origin, requestOrigin)) {
      return null;
    }

    return NextResponse.json(
      { error: "CSRF check failed: request origin does not match this server" },
      { status: 403 },
    );
  }

  const referer = req.headers.get("referer");
  if (referer) {
    if (matchesRequestOrigin(referer, requestOrigin)) {
      return null;
    }

    return NextResponse.json(
      { error: "CSRF check failed: request origin does not match this server" },
      { status: 403 },
    );
  }

  const fetchSite = req.headers.get("sec-fetch-site");

  if (fetchSite === "same-origin" || fetchSite === "same-site") {
    return null;
  }

  if (isDev && fetchSite === "none") {
    return null;
  }

  if (!origin && !referer && isDev) {
    return null;
  }

  return NextResponse.json(
    { error: "CSRF check failed: missing same-origin request metadata" },
    { status: 403 },
  );
}
