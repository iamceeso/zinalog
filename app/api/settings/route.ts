import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, deleteOldLogs, trimLogsToMax } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

function parsePositiveInt(value: unknown, field: string): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Field '${field}' must be a positive integer`);
  }

  return Math.floor(parsed);
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    retention_days: (await getSetting("retention_days")) ?? "30",
    max_logs: (await getSetting("max_logs")) ?? "100000",
    session_idle_timeout_minutes: (await getSetting("session_idle_timeout_minutes")) ?? "30",
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let trimmed = 0;

  if (body.retention_days !== undefined) {
    try {
      await setSetting(
        "retention_days",
        String(parsePositiveInt(body.retention_days, "retention_days"))
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid retention_days value" },
        { status: 400 }
      );
    }
  }
  if (body.max_logs !== undefined) {
    try {
      const maxLogs = parsePositiveInt(body.max_logs, "max_logs");
      await setSetting("max_logs", String(maxLogs));
      trimmed = await trimLogsToMax(maxLogs);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid max_logs value" },
        { status: 400 }
      );
    }
  }
  if (body.session_idle_timeout_minutes !== undefined) {
    try {
      await setSetting(
        "session_idle_timeout_minutes",
        String(parsePositiveInt(body.session_idle_timeout_minutes, "session_idle_timeout_minutes"))
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid session_idle_timeout_minutes value",
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ status: "updated", trimmed });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const deleted = await deleteOldLogs(days);
  return NextResponse.json({
    deleted,
    message: `Deleted ${deleted} logs older than ${days} days`,
  });
}
