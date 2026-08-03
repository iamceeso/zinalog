import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { checkCsrfProtection } from "@/lib/csrf";

// /api/logs is authenticated with a per-key API token (not the browser
// session cookie) and is rate-limited separately per key in lib/auth.ts, so
// it's exempt from CSRF checks and the generic admin-mutation rate limit.
// Every other mutating /api/** route is protected by default: this list is
// an explicit exclusion, not an allowlist, so a newly added route can't
// silently skip CSRF/rate-limit protection the way it could before.
const ADMIN_MUTATION_EXEMPT_PATHS = ["/api/logs"];

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
function isAdminMutation(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return (
    MUTATION_METHODS.has(request.method) &&
    pathname.startsWith("/api/") &&
    !ADMIN_MUTATION_EXEMPT_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    )
  );
}

function buildContentSecurityPolicy(
  request: NextRequest,
  nonce: string
): string {
  const scriptSources = [`'self'`, `'nonce-${nonce}'`];
  if (process.env.NODE_ENV !== "production") {
    scriptSources.push(`'unsafe-eval'`);
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${request.nextUrl.origin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function continueRequest(request: NextRequest, nonce: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

function finalizeResponse(
  request: NextRequest,
  response: NextResponse,
  nonce: string
): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(request, nonce)
  );
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  if (!isAdminMutation(request)) {
    return finalizeResponse(request, continueRequest(request, nonce), nonce);
  }

  const csrf = checkCsrfProtection(request);
  if (csrf) {
    return finalizeResponse(request, csrf, nonce);
  }

  const limited = checkAdminRateLimit(request);
  if (limited) {
    return finalizeResponse(request, limited, nonce);
  }

  return finalizeResponse(request, continueRequest(request, nonce), nonce);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
