import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkAdminRateLimit } from "@/lib/admin-rate-limit";
import { checkCsrfProtection } from "@/lib/csrf";

const ADMIN_MUTATION_PREFIXES = [
  "/api/access-audit",
  "/api/alerts",
  "/api/keys",
  "/api/settings",
  "/api/users",
];

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isProtectedAdminMutation(request: NextRequest): boolean {
  if (!MUTATION_METHODS.has(request.method)) {
    return false;
  }

  const { pathname } = request.nextUrl;
  return ADMIN_MUTATION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  if (!isProtectedAdminMutation(request)) {
    return NextResponse.next();
  }

  const csrf = checkCsrfProtection(request);
  if (csrf) return csrf;

  const limited = checkAdminRateLimit(request);
  if (limited) return limited;

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/change-password",
    "/api/keys/:path*",
    "/api/alerts/:path*",
    "/api/users/:path*",
    "/api/settings/:path*",
    "/api/access-audit/:path*",
  ],
};
