import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";
import {
  insertLog,
  queryLogs,
  getAllSettings,
  checkAndSetCooldown,
  countRecentLogs,
} from "@/lib/db";
import { sendAllNotifications } from "@/lib/notifications";
import { requireApiUser } from "@/lib/session-auth";

const VALID_LEVELS = ["info", "warning", "error", "debug"];

// Row-count trimming in lib/db/logs.ts only bounds the *number* of stored
// rows, not their size, so a single oversized log can still bloat the
// SQLite file arbitrarily. These caps bound each field's storage footprint.
const MAX_MESSAGE_BYTES = 32_000;
const MAX_STACK_BYTES = 64_000;
const MAX_METADATA_BYTES = 64_000;
const MAX_SERVICE_BYTES = 200;
// Rough ceiling on the whole request body, checked against Content-Length
// before the body is parsed. It's a cheap first line of defense only --
// Content-Length can be absent (chunked encoding) or wrong, so the
// per-field byte caps below are the real enforcement.
const MAX_BODY_BYTES =
  MAX_MESSAGE_BYTES + MAX_STACK_BYTES + MAX_METADATA_BYTES + 8_192;

function exceedsByteLength(value: string, maxBytes: number): boolean {
  return Buffer.byteLength(value, "utf8") > maxBytes;
}

function parsePositiveIntegerParam(
  value: string | null,
  fallback: number,
  { min = 1, max }: { min?: number; max?: number } = {}
): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

// CORS headers so browser apps can log directly
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.success) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status ?? 401, headers: CORS_HEADERS }
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Request body too large. Max ${MAX_BODY_BYTES} bytes` },
      { status: 413, headers: CORS_HEADERS }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { level, message, service, stack, metadata } = body as {
    level?: string;
    message?: string;
    service?: string;
    stack?: string;
    metadata?: unknown;
  };

  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "Field 'message' is required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (exceedsByteLength(message, MAX_MESSAGE_BYTES)) {
    return NextResponse.json(
      {
        error: `Field 'message' exceeds maximum size of ${MAX_MESSAGE_BYTES} bytes`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (typeof stack === "string" && exceedsByteLength(stack, MAX_STACK_BYTES)) {
    return NextResponse.json(
      {
        error: `Field 'stack' exceeds maximum size of ${MAX_STACK_BYTES} bytes`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (
    typeof service === "string" &&
    exceedsByteLength(service, MAX_SERVICE_BYTES)
  ) {
    return NextResponse.json(
      {
        error: `Field 'service' exceeds maximum size of ${MAX_SERVICE_BYTES} bytes`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const metadataJson = metadata !== undefined ? JSON.stringify(metadata) : null;
  if (metadataJson && exceedsByteLength(metadataJson, MAX_METADATA_BYTES)) {
    return NextResponse.json(
      {
        error: `Field 'metadata' exceeds maximum size of ${MAX_METADATA_BYTES} bytes`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const normalizedLevel = (level ?? "info").toLowerCase();
  if (!VALID_LEVELS.includes(normalizedLevel)) {
    return NextResponse.json(
      { error: `Invalid level. Must be one of: ${VALID_LEVELS.join(", ")}` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Respect service restriction on the API key
  const effectiveService =
    auth.apiKey?.service ?? (typeof service === "string" ? service : null);

  await insertLog({
    level: normalizedLevel,
    message,
    service: effectiveService ?? null,
    stack: typeof stack === "string" ? stack : null,
    metadata: metadataJson,
    api_key_id: auth.apiKey?.id ?? null,
  });

  // Fire-and-forget alert check
  void triggerAlertIfNeeded({
    level: normalizedLevel,
    message,
    service: effectiveService ?? null,
    stack: typeof stack === "string" ? stack : null,
    metadata: metadataJson,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ status: "logged" }, { headers: CORS_HEADERS });
}

async function triggerAlertIfNeeded(log: {
  level: string;
  message: string;
  service: string | null;
  stack: string | null;
  metadata: string | null;
  created_at: string;
}) {
  const s = await getAllSettings();
  const alertLevels = (s.alert_levels ?? "error")
    .split(",")
    .map((l) => l.trim());
  if (!alertLevels.includes(log.level)) return;

  const threshold = parseInt(s.alert_threshold ?? "1", 10);
  const cooldown = parseInt(s.alert_cooldown ?? "15", 10);
  const service = log.service ?? "__global__";

  const recentCount = await countRecentLogs(log.level, log.service, cooldown);
  if (recentCount < threshold) return;

  if (!(await checkAndSetCooldown(service, log.level, cooldown))) return;

  sendAllNotifications(log).catch((err) => console.error("[alert]", err));
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);

  const filters = {
    level: searchParams.get("level") ?? undefined,
    service: searchParams.get("service") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    page: parsePositiveIntegerParam(searchParams.get("page"), 1),
    limit: parsePositiveIntegerParam(searchParams.get("limit"), 50, {
      max: 200,
    }),
  };

  const { logs, total } = await queryLogs(filters, auth.user.allowed_services);

  return NextResponse.json({
    logs,
    pagination: {
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    },
  });
}
