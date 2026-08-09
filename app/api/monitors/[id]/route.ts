import { NextRequest, NextResponse } from "next/server";
import {
  deleteMonitor,
  getMonitorById,
  getMonitorUptimeStats,
  getMonitorUptimeStatsByPeriod,
  listMonitorChecks,
  updateMonitor,
} from "@/lib/db";
import { ensureMonitorSchedulerStarted } from "@/lib/monitors/scheduler";
import {
  monitorUniqueConstraintField,
  sanitizeMonitorForClient,
} from "@/lib/monitors/fields";
import { validateMonitorPayload } from "@/lib/monitors/validation";
import { requireApiUser } from "@/lib/session-auth";

function parseId(id: string): number | null {
  const numId = Number.parseInt(id, 10);
  return Number.isFinite(numId) ? numId : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("viewer");
  if (!auth.ok) return auth.response;

  ensureMonitorSchedulerStarted();

  const { id } = await params;
  const monitorId = parseId(id);
  if (monitorId === null) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const monitor = await getMonitorById(monitorId);
  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const [stats24h, stats7d, stats30d, stats365d, recentChecks] =
    await Promise.all([
      getMonitorUptimeStats(monitorId, 24),
      getMonitorUptimeStatsByPeriod(monitorId, "week"),
      getMonitorUptimeStatsByPeriod(monitorId, "month"),
      getMonitorUptimeStatsByPeriod(monitorId, "year"),
      listMonitorChecks(monitorId, 100),
    ]);

  return NextResponse.json({
    monitor: sanitizeMonitorForClient(monitor),
    stats24h,
    stats7d,
    stats30d,
    stats365d,
    recentChecks,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  ensureMonitorSchedulerStarted();

  const { id } = await params;
  const monitorId = parseId(id);
  if (monitorId === null) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await getMonitorById(monitorId);
  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { errors, value } = validateMonitorPayload(body);
  if (!value) {
    return NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  try {
    await updateMonitor(monitorId, {
      name: value.name,
      type: value.type,
      target: value.target,
      port: value.port,
      method: value.method,
      ...(value.headers !== undefined ? { headers: value.headers } : {}),
      basic_auth_user: value.basic_auth_user,
      ...(value.basic_auth_pass !== undefined
        ? { basic_auth_pass: value.basic_auth_pass }
        : {}),
      expected_status: value.expected_status,
      interval_seconds: value.interval_seconds,
      timeout_seconds: value.timeout_seconds,
      retries: value.retries,
      follow_redirects: value.follow_redirects,
      verify_ssl: value.verify_ssl,
      is_active: value.is_active,
      notify_enabled: value.notify_enabled,
    });
  } catch (err) {
    const field = monitorUniqueConstraintField(err);
    if (!field) throw err;
    return NextResponse.json(
      {
        error: "Validation failed",
        details: [`${field}: must be unique - already used by another monitor`],
      },
      { status: 409 }
    );
  }

  const updated = await getMonitorById(monitorId);
  return NextResponse.json({
    monitor: updated ? sanitizeMonitorForClient(updated) : null,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("operator");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const monitorId = parseId(id);
  if (monitorId === null) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const ok = await deleteMonitor(monitorId);
  if (!ok) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
