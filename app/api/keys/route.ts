import { NextRequest, NextResponse } from "next/server";
import { listApiKeys, createApiKey } from "@/lib/db";
import { randomBytes } from "crypto";
import { requireApiUser } from "@/lib/session-auth";

function generateKey(): string {
  return `zinalog_${randomBytes(24).toString("hex")}`;
}

export async function GET() {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  const keys = await listApiKeys();
  // Show only a fixed prefix — never expose any suffix to prevent brute-force narrowing
  const safeKeys = keys.map((k) => ({
    ...k,
    key: `zinalog_${"*".repeat(20)}`,
  }));
  return NextResponse.json({ keys: safeKeys });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, service, allowed_ips, rate_limit, expires_at } = body as {
    name?: string;
    service?: string;
    allowed_ips?: string;
    rate_limit?: number;
    expires_at?: string | null;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { error: "Field 'name' is required" },
      { status: 400 }
    );
  }

  let normalizedExpiry: string | null = null;
  if (expires_at !== undefined && expires_at !== null && expires_at !== "") {
    if (typeof expires_at !== "string") {
      return NextResponse.json({ error: "Field 'expires_at' must be a valid datetime string" }, { status: 400 });
    }

    const parsedExpiry = new Date(expires_at);
    if (Number.isNaN(parsedExpiry.getTime())) {
      return NextResponse.json({ error: "Field 'expires_at' must be a valid datetime string" }, { status: 400 });
    }

    if (parsedExpiry.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Field 'expires_at' must be in the future" }, { status: 400 });
    }

    normalizedExpiry = parsedExpiry.toISOString();
  }

  const key = generateKey();
  const created = await createApiKey({
    name: name.trim(),
    rawKey: key,
    service: service ?? null,
    allowed_ips: allowed_ips ?? null,
    rate_limit: typeof rate_limit === "number" ? rate_limit : 1000,
    expires_at: normalizedExpiry,
  });

  // Return the full key ONCE at creation time
  return NextResponse.json({ key: { ...created, key } }, { status: 201 });
}
