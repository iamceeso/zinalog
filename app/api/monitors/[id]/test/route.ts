import { NextRequest, NextResponse } from "next/server";
import { getMonitorById } from "@/lib/db";
import { runAndRecordMonitorCheck } from "@/lib/monitors/scheduler";
import { requireApiUser } from "@/lib/session-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
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

  const outcome = await runAndRecordMonitorCheck(monitor);

  return NextResponse.json({
    status: outcome.newStatus,
    previousStatus: outcome.previousStatus,
    check: outcome.check,
  });
}
