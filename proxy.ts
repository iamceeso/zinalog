import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { checkCsrfProtection } from "@/lib/csrf";

const ADMIN_MUTATION_PATHS = [
  "/api/access-audit",
  "/api/alerts",
  "/api/keys",
  "/api/settings",
  "/api/users",
];

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const ASSET_MATCHER =
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)";

function isAdminMutation(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return (
    MUTATION_METHODS.has(request.method) &&
    ADMIN_MUTATION_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

function buildContentSecurityPolicy(
  request: NextRequest,
  nonce: string,
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
  nonce: string,
): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(request, nonce),
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
  matcher: [ASSET_MATCHER],
};
