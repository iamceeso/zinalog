import { NextRequest, NextResponse } from "next/server";
import { getMonitorById, getMonitorUptimeStats, listMonitorChecks } from "@/lib/db";
import { requireApiUser } from "@/lib/session-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const monitorId = Number.parseInt(id, 10);
  if (!Number.isFinite(monitorId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const monitor = await getMonitorById(monitorId);
  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "200", 10) || 200, 1),
    2000
  );
  const hours = Math.min(
    Math.max(Number.parseInt(searchParams.get("hours") ?? "24", 10) || 24, 1),
    720
  );

  const [checks, stats] = await Promise.all([
    listMonitorChecks(monitorId, limit),
    getMonitorUptimeStats(monitorId, hours),
  ]);

  return NextResponse.json({ checks, stats });
}
